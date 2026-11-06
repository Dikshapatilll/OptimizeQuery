"""Tests for ML SQL AST feature extraction."""

from ml.features import FEATURE_COLUMNS, SQLFeatureExtractor


def test_feature_columns_completeness():
    extractor = SQLFeatureExtractor()
    sql = "SELECT id, name FROM users WHERE age > 25"
    feats = extractor.extract_features(sql)
    assert len(feats) == len(FEATURE_COLUMNS)
    for col in FEATURE_COLUMNS:
        assert col in feats
        assert isinstance(feats[col], (int, float))


def test_feature_extraction_joins_and_group_by():
    extractor = SQLFeatureExtractor()
    sql = """
    SELECT u.country, count(o.id) as order_count, sum(o.total) as gmv
    FROM users u
    INNER JOIN orders o ON u.id = o.user_id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE u.is_active = 1 AND o.status = 'completed'
    GROUP BY u.country
    HAVING count(o.id) > 5
    ORDER BY gmv DESC
    LIMIT 20 OFFSET 5
    """
    feats = extractor.extract_features(sql)
    assert feats["is_select"] == 1.0
    assert feats["num_tables"] >= 2.0
    assert feats["num_joins"] == 2.0
    assert feats["num_inner_joins"] == 1.0
    assert feats["num_left_joins"] == 1.0
    assert feats["has_group_by"] == 1.0
    assert feats["has_having"] == 1.0
    assert feats["has_order_by"] == 1.0
    assert feats["has_limit"] == 1.0
    assert feats["has_offset"] == 1.0
    assert feats["num_aggregates"] >= 2.0


def test_feature_vector_order_and_types():
    extractor = SQLFeatureExtractor()
    vec = extractor.extract_feature_vector("SELECT 1")
    assert len(vec) == len(FEATURE_COLUMNS)
    assert all(isinstance(v, (int, float)) for v in vec)


def test_cte_and_subqueries():
    extractor = SQLFeatureExtractor()
    sql = """
    WITH active_users AS (
        SELECT id FROM users WHERE is_active = 1
    )
    SELECT * FROM orders WHERE user_id IN (SELECT id FROM active_users)
    """
    feats = extractor.extract_features(sql)
    assert feats["num_ctes"] == 1.0
    assert feats["num_subqueries"] >= 1.0


def test_pre_execution_metadata_integration():
    extractor = SQLFeatureExtractor()
    sql = "SELECT * FROM users u WHERE u.country = 'US'"
    estimates = {"users": 50000}
    indexed = ["users.country"]
    feats = extractor.extract_features(sql, table_row_estimates=estimates, indexed_columns=indexed)
    assert feats["total_table_rows_est_log"] > 0
    assert feats["ratio_indexed_filters"] == 1.0
