"""SQL Query safety validator for benchmarking.

Ensures that only read-only single-statement SELECT queries (including CTEs and UNIONs)
are executed during benchmarking, protecting databases from accidental or malicious mutations.
"""

from __future__ import annotations

import logging
import re
import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)


def validate_select_query(sql: str) -> str:
    """Validate that the query is strictly a read-only SELECT or WITH statement.

    Rejects DDL/DML, multi-statement injection, and destructive statements
    to protect databases during benchmark execution.
    """
    clean_sql = sql.strip().rstrip(";")
    if not clean_sql:
        raise ValueError("Query cannot be empty.")

    try:
        statements = sqlglot.parse(clean_sql)
        if len(statements) != 1:
            raise ValueError(
                "Benchmarking permits exactly one SQL statement per run; multiple statements are prohibited."
            )
        root = statements[0]
        if not isinstance(root, (exp.Select, exp.Union)):
            raise ValueError(
                f"Only read-only SELECT queries are permitted for benchmarking. Prohibited statement type: {type(root).__name__}."
            )
    except Exception as exc:
        if isinstance(exc, ValueError):
            raise
        # Fallback regex guard if sqlglot parse fails on dialect quirks
        stripped = re.sub(r"/\*.*?\*/", "", clean_sql, flags=re.DOTALL)
        stripped = re.sub(r"--[^\n]*", "", stripped).strip()
        upper = stripped.upper()
        if not (upper.startswith("SELECT") or upper.startswith("WITH")):
            raise ValueError("Only read-only SELECT queries are permitted for benchmarking.")
        prohibited = [
            r"\bDROP\b",
            r"\bDELETE\b",
            r"\bUPDATE\b",
            r"\bINSERT\b",
            r"\bTRUNCATE\b",
            r"\bALTER\b",
        ]
        for p in prohibited:
            if re.search(p, upper):
                raise ValueError("Query contains prohibited mutation keywords; only SELECT is permitted.")

    return clean_sql
