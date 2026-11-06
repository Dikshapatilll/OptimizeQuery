"""Random Forest and XGBoost Regressors for SQL execution time prediction."""

from __future__ import annotations

import logging
from typing import Any
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import xgboost as xgb

logger = logging.getLogger(__name__)


class SQLExecutionTimeModel:
    """Base wrapper ensuring target log-transform and millisecond conversion."""

    def __init__(self, model_type: str, estimator: Any) -> None:
        self.model_type = model_type
        self.estimator = estimator

    def fit(self, X: np.ndarray, y_ms: np.ndarray) -> SQLExecutionTimeModel:
        """Fit model using log1p-transformed target values to stabilize variance."""
        # y_ms must be non-negative
        safe_y = np.maximum(y_ms, 0.0)
        y_log = np.log1p(safe_y)
        self.estimator.fit(X, y_log)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Predict execution time in original milliseconds."""
        y_log_pred = self.estimator.predict(X)
        # Invert log1p: expm1
        y_ms_pred = np.expm1(y_log_pred)
        # Lower bound guard at 0.01 ms
        return np.maximum(y_ms_pred, 0.01)


def create_random_forest_model(random_state: int = 42) -> SQLExecutionTimeModel:
    """Create a configured Random Forest Regressor."""
    rf = RandomForestRegressor(
        n_estimators=150,
        max_depth=14,
        min_samples_split=3,
        min_samples_leaf=2,
        max_features="sqrt",
        random_state=random_state,
        n_jobs=-1,
    )
    return SQLExecutionTimeModel(model_type="random_forest", estimator=rf)


def create_xgboost_model(random_state: int = 42) -> SQLExecutionTimeModel:
    """Create a configured XGBoost Regressor."""
    xg_reg = xgb.XGBRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=random_state,
        n_jobs=-1,
    )
    return SQLExecutionTimeModel(model_type="xgboost", estimator=xg_reg)
