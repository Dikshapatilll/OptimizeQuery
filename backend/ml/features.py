"""SQL AST Feature Extractor using sqlglot.

IMPORTANT ML RULE:
Prediction inputs must only contain features available before executing the query.
Do not include actual execution time, actual runtime rows, or actual buffer
measurements as prediction input features.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any, Sequence

import sqlglot
import sqlglot.expressions as exp

logger = logging.getLogger(__name__)

# Canonical feature column names in deterministic order
FEATURE_COLUMNS: list[str] = [
    "query_length_chars",
    "token_count",
    "is_select",
    "is_insert",
    "is_update",
    "is_delete",
    "num_tables",
    "num_joins",
    "num_inner_joins",
    "num_left_joins",
    "num_right_joins",
    "num_cross_joins",
    "num_where_predicates",
    "num_and_predicates",
    "num_or_predicates",
    "num_in_predicates",
    "num_like_predicates",
    "has_group_by",
    "num_group_by_cols",
    "has_having",
    "has_order_by",
    "num_order_by_cols",
    "has_distinct",
    "num_aggregates",
    "num_subqueries",
    "num_ctes",
    "num_unions",
    "has_limit",
    "limit_value_log",
    "has_offset",
    "ast_depth",
    "total_ast_nodes",
    "total_table_rows_est_log",
    "max_table_rows_est_log",
    "ratio_indexed_filters",
]


def _compute_ast_depth(node: exp.Expression | Any, current: int = 1) -> int:
    """Compute maximum depth of the sqlglot AST."""
    if not isinstance(node, exp.Expression):
        return current
    max_d = current
    for child in node.iter_expressions():
        d = _compute_ast_depth(child, current + 1)
        if d > max_d:
            max_d = d
    return max_d


class SQLFeatureExtractor:
    """Extracts numeric pre-execution features from a SQL query and optional schema context."""

    def __init__(self, read_dialect: str | None = None) -> None:
        self.read_dialect = read_dialect

    def extract_features(
        self,
        sql: str,
        table_row_estimates: dict[str, int] | None = None,
        indexed_columns: Sequence[str] | None = None,
    ) -> dict[str, float]:
        """Extract a deterministic dictionary of features from SQL.

        Args:
            sql: Raw SQL query string.
            table_row_estimates: Pre-execution table row counts from catalog/metadata.
            indexed_columns: Known indexed column names (e.g. ['users.id', 'orders.created_at']).

        Returns:
            Dictionary mapping feature column names to float values.
        """
        clean_sql = sql.strip()
        features: dict[str, float] = {col: 0.0 for col in FEATURE_COLUMNS}

        features["query_length_chars"] = float(len(clean_sql))
        features["token_count"] = float(len(clean_sql.split()))

        # Attempt AST parsing with fallback
        parsed: exp.Expression | None = None
        try:
            parsed = sqlglot.parse_one(clean_sql, read=self.read_dialect, error_level=sqlglot.ErrorLevel.IGNORE)
        except Exception as exc:
            logger.debug("sqlglot parsing failed in feature extraction: %s; using regex fallback", exc)

        if parsed is None:
            # Fallback regex extraction
            self._extract_fallback(clean_sql, features)
        else:
            self._extract_ast(parsed, features)

        # Context features (pre-execution catalog knowledge, if available)
        self._extract_context_features(
            parsed=parsed,
            clean_sql=clean_sql,
            table_row_estimates=table_row_estimates,
            indexed_columns=indexed_columns,
            features=features,
        )

        return features

    def extract_feature_vector(
        self,
        sql: str,
        table_row_estimates: dict[str, int] | None = None,
        indexed_columns: Sequence[str] | None = None,
    ) -> list[float]:
        """Extract feature values as an ordered list corresponding to FEATURE_COLUMNS."""
        feat_map = self.extract_features(
            sql=sql,
            table_row_estimates=table_row_estimates,
            indexed_columns=indexed_columns,
        )
        return [feat_map[col] for col in FEATURE_COLUMNS]

    def _extract_ast(self, parsed: exp.Expression, features: dict[str, float]) -> None:
        # Statement type
        if isinstance(parsed, exp.Select):
            features["is_select"] = 1.0
        elif isinstance(parsed, exp.Insert):
            features["is_insert"] = 1.0
        elif isinstance(parsed, exp.Update):
            features["is_update"] = 1.0
        elif isinstance(parsed, exp.Delete):
            features["is_delete"] = 1.0
        else:
            first_word = parsed.key.upper() if hasattr(parsed, "key") else ""
            if "SELECT" in first_word or parsed.find(exp.Select):
                features["is_select"] = 1.0

        # CTEs
        ctes = list(parsed.find_all(exp.CTE))
        features["num_ctes"] = float(len(ctes))
        cte_aliases = {c.alias.lower() for c in ctes if c.alias}

        # Tables (excluding CTE alias names)
        tables = set()
        for t in parsed.find_all(exp.Table):
            t_name = t.name.lower() if t.name else ""
            if t_name and t_name not in cte_aliases:
                tables.add(t_name)
        features["num_tables"] = float(len(tables))

        # Joins
        joins = list(parsed.find_all(exp.Join))
        features["num_joins"] = float(len(joins))
        for j in joins:
            j_str = str(j.kind or "").upper() + " " + str(j.side or "").upper()
            if "LEFT" in j_str:
                features["num_left_joins"] += 1.0
            elif "RIGHT" in j_str:
                features["num_right_joins"] += 1.0
            elif "CROSS" in j_str:
                features["num_cross_joins"] += 1.0
            else:
                features["num_inner_joins"] += 1.0

        # Where & Filters
        where_nodes = list(parsed.find_all(exp.Where))
        features["num_where_predicates"] = float(len(where_nodes))
        features["num_and_predicates"] = float(len(list(parsed.find_all(exp.And))))
        features["num_or_predicates"] = float(len(list(parsed.find_all(exp.Or))))
        features["num_in_predicates"] = float(len(list(parsed.find_all(exp.In))))
        features["num_like_predicates"] = float(
            len(list(parsed.find_all(exp.Like))) + len(list(parsed.find_all(exp.ILike)))
        )

        # Group By
        group_nodes = list(parsed.find_all(exp.Group))
        if group_nodes:
            features["has_group_by"] = 1.0
            cols = sum(len(g.expressions) for g in group_nodes)
            features["num_group_by_cols"] = float(cols)

        # Having
        having_nodes = list(parsed.find_all(exp.Having))
        if having_nodes:
            features["has_having"] = 1.0

        # Order By
        order_nodes = list(parsed.find_all(exp.Order))
        if order_nodes:
            features["has_order_by"] = 1.0
            cols = sum(len(o.expressions) for o in order_nodes)
            features["num_order_by_cols"] = float(cols)

        # Distinct
        if parsed.find(exp.Distinct):
            features["has_distinct"] = 1.0

        # Aggregates
        aggregates = list(parsed.find_all(exp.AggFunc))
        features["num_aggregates"] = float(len(aggregates))

        # Subqueries (Select inside other expressions)
        selects = list(parsed.find_all(exp.Select))
        if len(selects) > 1:
            features["num_subqueries"] = float(len(selects) - 1)

        # Unions
        unions = list(parsed.find_all(exp.Union))
        features["num_unions"] = float(len(unions))

        # Limit
        limits = list(parsed.find_all(exp.Limit))
        if limits:
            features["has_limit"] = 1.0
            try:
                lim_expr = limits[0].expression
                val = int(str(lim_expr))
                features["limit_value_log"] = float(math.log1p(max(0, val)))
            except Exception:
                features["limit_value_log"] = float(math.log1p(100))

        # Offset
        if parsed.find(exp.Offset):
            features["has_offset"] = 1.0

        # AST Complexity
        features["ast_depth"] = float(_compute_ast_depth(parsed))
        features["total_ast_nodes"] = float(len(list(parsed.walk())))

    def _extract_fallback(self, sql: str, features: dict[str, float]) -> None:
        upper = sql.upper()
        if upper.startswith("SELECT"):
            features["is_select"] = 1.0
        elif upper.startswith("INSERT"):
            features["is_insert"] = 1.0
        elif upper.startswith("UPDATE"):
            features["is_update"] = 1.0
        elif upper.startswith("DELETE"):
            features["is_delete"] = 1.0

        # Rough counts
        features["num_joins"] = float(len(re.findall(r"\bJOIN\b", upper)))
        features["num_left_joins"] = float(len(re.findall(r"\bLEFT\s+JOIN\b", upper)))
        features["num_right_joins"] = float(len(re.findall(r"\bRIGHT\s+JOIN\b", upper)))
        features["num_inner_joins"] = float(len(re.findall(r"\bINNER\s+JOIN\b", upper)))
        features["has_group_by"] = 1.0 if "GROUP BY" in upper else 0.0
        features["has_order_by"] = 1.0 if "ORDER BY" in upper else 0.0
        features["has_distinct"] = 1.0 if "DISTINCT" in upper else 0.0
        features["has_having"] = 1.0 if "HAVING" in upper else 0.0
        features["num_and_predicates"] = float(len(re.findall(r"\bAND\b", upper)))
        features["num_or_predicates"] = float(len(re.findall(r"\bOR\b", upper)))
        features["num_aggregates"] = float(len(re.findall(r"\b(COUNT|SUM|AVG|MIN|MAX)\s*\(", upper)))
        features["num_tables"] = max(1.0, float(len(re.findall(r"\b(FROM|JOIN)\s+([a-zA-Z0-9_]+)", upper))))
        features["total_ast_nodes"] = float(len(sql.split()))

    def _extract_context_features(
        self,
        parsed: exp.Expression | None,
        clean_sql: str,
        table_row_estimates: dict[str, int] | None,
        indexed_columns: Sequence[str] | None,
        features: dict[str, float],
    ) -> None:
        """Add pre-execution catalog metadata (row counts, indexed filters) if known."""
        if table_row_estimates:
            total_rows = 0
            max_rows = 0
            for count in table_row_estimates.values():
                if count and count > 0:
                    total_rows += count
                    if count > max_rows:
                        max_rows = count
            features["total_table_rows_est_log"] = float(math.log1p(total_rows))
            features["max_table_rows_est_log"] = float(math.log1p(max_rows))

        if indexed_columns and parsed:
            # Check column references in WHERE conditions
            where_cols = {
                c.name.lower()
                for c in parsed.find_all(exp.Column)
                if c.name and c.find_ancestor(exp.Where, exp.Join)
            }
            if where_cols:
                norm_indexed = {idx.split(".")[-1].lower() for idx in indexed_columns}
                indexed_count = sum(1 for col in where_cols if col in norm_indexed)
                features["ratio_indexed_filters"] = float(indexed_count / max(1, len(where_cols)))
            else:
                features["ratio_indexed_filters"] = 1.0
        else:
            features["ratio_indexed_filters"] = 0.5
