<div align="center">
  <img src="assets/logo.png" width="500" alt="OptimizeQL Logo">

  # OptimizeQL — Intelligent Query Optimization Framework using AI and Operations Research

<p align="center">
  <a href="https://www.python.org"><img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12+"></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 16"></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License"></a>
</p>

An intelligent, multi-objective database query optimization and empirical benchmarking framework. OptimizeQL combines machine learning pre-execution latency prediction, Operations Research multi-objective scoring and knapsack index selection, live database execution, and empirical benchmark validation.

<p>
  <a href="#-workflow">🔄 Workflow</a> &middot;
  <a href="#-features">✨ Features</a> &middot;
  <a href="#%EF%B8%8F-system-architecture">🏛️ Architecture</a> &middot;
  <a href="#-tech-stack">🛠️ Tech Stack</a> &middot;
  <a href="#-quick-start">🚀 Quick Start</a> &middot;
  <a href="#-experimental-results">📊 Experimental Results</a> &middot;
  <a href="#-testing--verification">🧪 Verification</a> &middot;
  <a href="#-datasets">📁 Datasets</a> &middot;
  <a href="#-attribution--license">📄 License</a>
</p>
</div>

---

## 🔄 Workflow

OptimizeQL implements a closed-loop optimization and verification pipeline:

```
┌─────────────────┐      ┌─────────────────────────┐      ┌────────────────────────────────┐
│   Input SQL     │ ───► │  ML Pre-Execution       │ ───► │  Operations Research (OR)      │
│   Query String  │      │  Latency Prediction     │      │  Multi-Objective Optimization  │
└─────────────────┘      │  (RandomForest/XGBoost) │      │  (Scoring & 0/1 Knapsack)      │
                         └─────────────────────────┘      └────────────────────────────────┘
                                                                           │
┌─────────────────────────┐      ┌─────────────────────────┐               │
│  Empirical Benchmark    │ ◄─── │  Controlled Database    │ ◄─────────────┘
│  Validation & Reporting │      │  Execution in PG        │
│  (History, Charts, PDF) │      │  (Isolated Transaction) │
└─────────────────────────┘      └─────────────────────────┘
```

1. **ML Latency Prediction**: Before executing queries, SQL queries are parsed into AST representations (`sqlglot`), extracting 35 structural features (joins, predicates, groupings, aggregations, sort keys). Random Forest and XGBoost regressors estimate pre-execution latency.
2. **Operations Research Optimization**: Evaluates candidate optimizations (indexes, rewrites) across four independent, non-overlapping objectives (execution time, planner cost, buffer reads, buffer hits) using min-max normalization. Under storage constraints, a 0/1 knapsack dynamic program selects optimal index configurations.
3. **Controlled Database Execution**: Applies approved optimizations inside isolated PostgreSQL transactions using `EXPLAIN (ANALYZE, BUFFERS)` to collect exact root-level performance telemetry without risking production state.
4. **Empirical Benchmark Validation**: Executes multi-trial warm repetitions, validates result-set equivalence (bounded row count, column types, checksums), cross-checks ML predictions against measured latencies, and exports verifiable reports.

---

## ✨ Features

- 🔬 **SQL Query & Plan Introspection** — Connects to PostgreSQL or MySQL, runs `EXPLAIN (ANALYZE, BUFFERS)`, and inspects relational operators, join types, filter predicates, and memory buffer usage.
- 🤖 **ML Execution-Time Prediction** — Random Forest and XGBoost gradient-boosted regressors predict execution latency in milliseconds before query execution.
- 📐 **Pre-Execution SQL AST Feature Extraction** — Parses SQL queries via `sqlglot` to extract 35 structural complexity features in $O(N)$ token time without database locks.
- ⚖️ **Multi-Objective Operations Research Scoring** — Evaluates optimization alternatives across four independent objectives:
  - **Execution Time** (40% weight, minimize)
  - **Planner Cost** (30% weight, minimize)
  - **Shared Buffer Reads** (20% weight, minimize)
  - **Shared Buffer Hits** (10% weight, minimize)
- 🎒 **0/1 Knapsack Index Budgeting** — Selects optimal sets of index recommendations under strict storage budgets (in MB) using linear programming (`PuLP`) and dynamic programming.
- 💡 **Automated Recommendations** — Generates dialect-aware `CREATE INDEX` recommendations, subquery rewrites, join restructurings, and configuration tuning.
- ⏱️ **PostgreSQL Multi-Trial Benchmarking** — Executes controlled 5-trial and 15-trial benchmarks in isolated transactions, reporting initial-run latency, warm median, mean, standard deviation, and Student's $t$ confidence intervals.
- 🔍 **Strict Provenance Tagging** — Distinguishes all metrics with verifiable provenance badges:
  - `[MEASURED]`: Engine telemetry from `EXPLAIN (ANALYZE, BUFFERS)`
  - `[ESTIMATED]`: PostgreSQL optimizer cost planner metrics
  - `[PREDICTED]`: ML regressor latency estimates
- 🛡️ **Result-Set Equivalence Verification** — Automatically verifies that rewritten queries produce identical result sets (row count, column types, ordering, sample checksums).
- 📊 **Interactive Benchmarking Workspace** — Multi-tab UI with latency comparison bar charts, multi-trial variance line charts, cost/buffer comparisons, and historical run trackers.
- 📄 **Export Verifiable Reports** — Export benchmark comparisons to structured CSV datasets and publication-ready PDF reports.

---

## 🏛️ System Architecture

OptimizeQL is structured as a decoupled, full-stack application:

```
OptimizeQL/
├── ⚛️ frontend/                  # Next.js 16 Web Application
│   ├── src/app/                  # App Router pages (/analyze, /benchmark, /dashboard, /history, /settings)
│   ├── src/components/           # UI components (Monaco SQL editor, Benchmark workspace, Recharts, Badges)
│   ├── src/lib/                  # API client, report exporters (PDF/CSV), types
│   └── scripts/                  # Frontend test runner (Node.js test runner)
├── 🐍 backend/                   # FastAPI Backend Application
│   ├── api/routes/               # REST API endpoints (analyze, benchmark, ml, or_optimization, connections)
│   ├── ml/                       # Machine Learning Subsystem
│   │   ├── dataset.py            # Benchmark query generator & SQLite seed loader
│   │   ├── features.py           # SQL AST feature extractor (35 features via sqlglot)
│   │   ├── models.py             # Random Forest & XGBoost model factory
│   │   ├── predictor.py          # Pre-execution inference service
│   │   ├── trainer.py            # Model training & train/val/test evaluation pipeline
│   │   └── artifacts/            # Serialized models (.joblib), scalers, and metrics
│   ├── or_engine/                # Operations Research Subsystem
│   │   ├── objectives.py         # 4-objective extraction from PostgreSQL plans
│   │   ├── scoring.py            # Min-max normalization & weighted penalty scoring
│   │   ├── index_selector.py     # 0/1 Knapsack index selection under storage budget
│   │   └── optimizer.py          # Unified optimization orchestrator
│   ├── benchmarking/             # Empirical Benchmarking Engine
│   │   ├── runner.py             # Multi-trial execution runner & root-level buffer extractor
│   │   ├── evaluator.py          # Warm median, speedup %, and caching analysis
│   │   └── validator.py          # Bounded result-set equivalence validator
│   ├── connectors/               # PostgreSQL (psycopg2) and MySQL database drivers
│   ├── core/                     # Configuration, SQLAlchemy ORM, Fernet encryption
│   └── tests/                    # 164 unit and integration tests (pytest)
└── 📁 data/                      # Research datasets and experimental benchmarks
    ├── benchmark_dataset.json    # 500 synthetic queries with measured SQLite execution times
    ├── benchmark_seeded.db       # Synthetic benchmark SQLite database (3.5 MB)
    ├── experimental_results.json # Primary 5-trial PostgreSQL benchmark results
    ├── experimental_results_extended_w2.json # Supplementary 15-trial ASC index experiment
    └── experimental_results_paired_w2.json   # Controlled 15-trial paired baseline vs. DESC experiment
```

---

## 🛠️ Tech Stack

### Backend Dependencies (`backend/requirements.txt`)
| Component | Package | Exact Version | Purpose |
| :--- | :--- | :--- | :--- |
| **API Framework** | `fastapi` | `0.115.5` | High-performance asynchronous REST API |
| **ASGI Server** | `uvicorn` | `0.32.1` | ASGI web server |
| **ORM & Database** | `sqlalchemy` | `2.0.36` | Database ORM and connection pooling |
| **PostgreSQL Driver**| `psycopg2-binary`| `2.9.10` | Low-level PostgreSQL driver for `EXPLAIN (ANALYZE, BUFFERS)` |
| **MySQL Driver** | `mysql-connector-python` | `9.1.0` | MySQL connection driver |
| **SQL Parsing** | `sqlglot` | `25.33.0` | Transpilation and AST extraction |
| **ML Models** | `scikit-learn` | `>=1.5.0` | Random Forest Regressor & StandardScaler |
| **Gradient Boosting**| `xgboost` | `>=2.1.0` | XGBoost Regressor |
| **Model Persistence**| `joblib` | `>=1.4.0` | Model artifact serialization |
| **Linear Program** | `PuLP` | `>=2.8.0,<3.0.0`| 0/1 Knapsack index budgeting solver |
| **Data Processing** | `pandas`, `numpy`| `>=2.2.0`, `>=1.26.0` | Feature matrices and array operations |
| **Encryption** | `cryptography` | `43.0.3` | Fernet symmetric credential encryption |
| **Testing** | `pytest`, `httpx` | `8.3.4`, `0.28.1` | Automated test suite and async client |

### Frontend Dependencies (`frontend/package.json`)
| Component | Package | Exact Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | `next` | `16.1.6` | Next.js with Turbopack App Router |
| **UI Library** | `react`, `react-dom`| `19.2.3` | User interface rendering |
| **Styling** | `tailwindcss` | `^4` | Tailwind CSS 4 styling engine |
| **Code Editor** | `@monaco-editor/react` | `^4.7.0` | SQL editor with syntax highlighting |
| **Visual Charts** | `recharts` | `^3.7.0` | Responsive latency and variance charts |
| **PDF Generation** | `jspdf` | `^4.2.1` | Client-side benchmark PDF generation |
| **Local Database** | `@electric-sql/pglite` | `^0.3.16` | In-browser WebAssembly PostgreSQL sandbox |
| **Language** | `typescript` | `^5` | Strict static type checking |

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/Dikshapatilll/OptimizeQuery.git
cd OptimizeQuery
```

### 2. Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Start FastAPI server on port 8000
uvicorn main:app --reload
```
API documentation is available at 👉 [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open application UI at 👉 [http://localhost:3000](http://localhost:3000)

### 4. Docker (Optional)
```bash
docker compose up --build
```

---

## 📊 Experimental Results

Controlled empirical experiments were executed on PostgreSQL 14.18 against a realistic benchmark dataset (5,000 `users`, 25,000 `orders`, 50,000 `order_items`, 50,000 `access_logs`).

All buffer metrics strictly report **authoritative root-level aggregates** directly from PostgreSQL root execution plan nodes:

| Workload | Optimization Type | Baseline Latency `[MEASURED]` | Optimized Latency `[MEASURED]` | Latency Reduction | Speedup Factor | Planner Cost `[ESTIMATED]` | Root Buffer Hits `[MEASURED]` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **W1: JOIN + Aggregation** | B-Tree Index on `order_items(order_id)` | $11.333\text{ ms}$ (warm) | **$2.749\text{ ms}$** (warm) | **$75.74\%$** | **$4.12\times$** | $1632.51 \to 963.71$ | $550 \to 2,215\text{ blocks}$* |
| **W2: Range Filter + Sort**| Composite B-Tree Index `(status_code, resp DESC)` | $5.4925\text{ ms}$ (warm) | **$0.0170\text{ ms}$** (warm) | **$99.69\%$** | **$323.09\times$** | $1248.63 \to 64.16$ | $451 \to 52\text{ blocks}$ |
| *(W2 15-Trial Paired)* | Controlled 15-Trial Paired Re-evaluation | $4.9435\text{ ms}$ (warm) | **$0.0170\text{ ms}$** (warm) | **$99.66\%$** | **$290.79\times$** | $1248.63 \to 64.16$ | $451 \to 52\text{ blocks}$ |
| **W3: Correlated Subquery** | Rewrite to Relational `LEFT JOIN` + `GROUP BY` | $625.5005\text{ ms}$ (warm) | **$2.269\text{ ms}$** (warm) | **$99.64\%$** | **$275.67\times$** | $413569.24 \to 698.26$ | $141,525 \to 271\text{ blocks}$ |

*\*Note: In W1, the nested loop index scan touches more memory buffer blocks than sequential hash joins ($2,215 > 550$), incurring an intentional buffer hit penalty in OR scoring while significantly reducing execution latency ($75.74\%$).*

> [!NOTE]
> The performance numbers above represent empirical measurements obtained in a dedicated local PostgreSQL 14.18 experimental environment under transaction isolation. They demonstrate framework capabilities and do not constitute universal guarantees for arbitrary production systems with different hardware, caching configurations, or concurrency contention.

---

## ⚠️ Machine Learning Scope & Limitations

1. **Training Data Distribution**: The execution-time prediction model was trained on 500 synthetic queries executed against an embedded SQLite database (`data/benchmark_seeded.db`). Generalization to arbitrary production PostgreSQL workloads cannot be assumed without fine-tuning on workload-specific `pg_stat_statements` execution history.
2. **Correlated Subquery Variance**: In Workload 3, the ML model predicted $4.68\text{ ms}$ while actual baseline execution required $625.50\text{ ms}$. This prediction error occurred because correlated scalar subqueries execute nested sequential scans across 25,000 rows ($646$ total subplan loops), a structural behavior underrepresented in the synthetic SQLite training distribution.
3. **Bounded Equivalence**: Result-set equivalence verification validates schemas, row counts, and sample checksums up to a bounded threshold (default: 1,000 rows) to prevent client memory exhaustion. It does not constitute formal mathematical proof for all unbounded input states.

---

## 🧪 Testing & Verification

The framework maintains an automated test suite across backend and frontend:

- **Backend Pytest Suite**: **164 passed** in 3.10s
  - API endpoint integration tests
  - ML feature extraction & regression tests
  - OR multi-objective scoring & root-level buffer penalty tests
  - 0/1 knapsack index selection budget tests
  - PostgreSQL transaction isolation & rollback runner tests
- **Frontend Unit Tests**: **3 passed** in 48ms
  - CSV export formatting & header validation
  - Provenance badge classification (`[MEASURED]`, `[ESTIMATED]`, `[PREDICTED]`)
  - Speedup and percentage improvement math validation
- **TypeScript Compilation**: **0 errors** (`npx tsc --noEmit`)
- **Next.js Production Build**: Clean static and dynamic compilation of all 10 application pages via Turbopack.

To run verification locally:
```bash
# Backend tests
backend/.venv/bin/pytest backend/tests -q

# Frontend tests
cd frontend && npm test

# Typecheck
cd frontend && npx tsc --noEmit

# Production build
cd frontend && npm run build
```

---

## 📁 Datasets

All empirical and synthetic datasets are preserved under the `data/` directory:

1. [`data/benchmark_dataset.json`](data/benchmark_dataset.json) — 500 synthetic SQL queries with execution labels measured on SQLite.
2. [`data/benchmark_seeded.db`](data/benchmark_seeded.db) — 3.5 MB SQLite database seeded with synthetic e-commerce tables (users, products, orders, order items, access logs).
3. [`data/experimental_results.json`](data/experimental_results.json) — Primary 5-trial benchmark results for W1, W2, and W3 on PostgreSQL 14.18.
4. [`data/experimental_results_extended_w2.json`](data/experimental_results_extended_w2.json) — Supplementary 15-trial ASC index experiment.
5. [`data/experimental_results_paired_w2.json`](data/experimental_results_paired_w2.json) — Controlled 15-trial paired baseline vs. DESC index experiment with raw observations and Student's $t$ confidence intervals.

---

## 📄 Attribution & License

- **Upstream Project**: This project is built upon the open-source foundation of [OptimizeQL](https://github.com/SubhanHakverdiyev/OptimizeQL) by Subhan Hakverdiyev.
- **License**: Licensed under the [MIT License](LICENSE). Copyright (c) 2025 Subhan Hagverdiyev.
