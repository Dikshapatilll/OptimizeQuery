"""API routes for Query Performance Benchmarking.

POST /api/v1/benchmark/run      — Execute controlled benchmark of original vs optimized query/index
GET  /api/v1/benchmark/history  — List past benchmark comparisons
GET  /api/v1/benchmark/{id}     — Retrieve detailed benchmark result
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from sqlalchemy.orm import Session

from api.dependencies import get_real_ip, require_api_key
from api.models.orm import BenchmarkHistory
from benchmarking.models import (
    BenchmarkComparisonResult,
    BenchmarkHistoryItem,
    BenchmarkRunRequest,
)
from benchmarking.service import BenchmarkService
from core.config import settings
from core.database import get_db

logger = logging.getLogger(__name__)

_bench_deps = [] if settings.hosted_mode else [Depends(require_api_key)]
router = APIRouter(prefix="/benchmark", tags=["benchmarking"], dependencies=_bench_deps)
limiter = Limiter(key_func=get_real_ip)
_rate = settings.hosted_rate_limit if settings.hosted_mode else settings.rate_limit


@router.post("/run", response_model=BenchmarkComparisonResult)
@limiter.limit(_rate)
def run_benchmark(
    request: Request,
    body: BenchmarkRunRequest,
    db: Session = Depends(get_db),
):
    """Execute a rigorous multi-run benchmark comparing original and optimized queries."""
    if len(body.original_sql) > settings.max_query_length:
        raise HTTPException(
            status_code=400,
            detail=f"Query exceeds maximum allowed length of {settings.max_query_length} characters.",
        )

    service = BenchmarkService(db)
    try:
        result = service.run_benchmark(body)
        return result
    except Exception as exc:
        logger.exception("Benchmark run failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Benchmark execution failed: {exc}",
        )


@router.get("/history", response_model=list[BenchmarkHistoryItem])
def get_benchmark_history(
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List historical benchmark runs."""
    rows = (
        db.query(BenchmarkHistory)
        .order_by(BenchmarkHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return rows


@router.get("/{benchmark_id}", response_model=BenchmarkComparisonResult)
def get_benchmark_detail(
    benchmark_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve full telemetry and comparison for a past benchmark run."""
    row = db.query(BenchmarkHistory).filter(BenchmarkHistory.id == benchmark_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Benchmark record not found")

    if not row.full_telemetry_json:
        raise HTTPException(status_code=404, detail="Full benchmark telemetry is not available")

    try:
        data = json.loads(row.full_telemetry_json)
        return BenchmarkComparisonResult.model_validate(data)
    except Exception as exc:
        logger.exception("Failed to parse benchmark telemetry: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load telemetry")
