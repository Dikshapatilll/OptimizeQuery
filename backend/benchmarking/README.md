# OptimizeQL Query Performance Benchmarking Module

Empirical query performance benchmarking engine for PostgreSQL and SQLite controlled environments.

## Modules

- `models.py`: Pydantic data schemas for run telemetry, statistical aggregates, caching analysis, and benchmark comparisons.
- `runner.py`: Benchmark runner executing repeated trials ($N$ runs), isolating cold vs warm executions, and computing median/variance/buffer metrics.
- `index_benchmarker.py`: Safe index recommendation testing via transactional DDL rollback (PostgreSQL) or in-memory cloned sandboxes (SQLite).
- `evaluator.py`: Result-set equivalence diffing, percentage improvement calculations, and ML prediction validation.
- `service.py`: Service orchestrator managing execution, database persistence, and ML/OR integration.

## Full Documentation

See full technical specification in `/Users/diksha/.gemini/antigravity/brain/fd48fa6d-bc5b-4ee1-a345-bb27ec50aace/benchmarking_module_spec.md`.
