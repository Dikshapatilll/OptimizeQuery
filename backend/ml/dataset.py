"""Dataset management for ML execution-time prediction.

Collects real historical query execution times from query_history and
provides a benchmark execution generator that executes real queries against
a real seeded test database to measure genuine execution times (clearly
tagged as is_benchmark=True).
"""

from __future__ import annotations

import json
import logging
import os
import random
import sqlite3
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)

BENCHMARK_CACHE_PATH = Path("data/benchmark_dataset.json")


@dataclass
class QuerySample:
    sql: str
    execution_time_ms: float
    planning_time_ms: float | None = None
    is_benchmark: bool = False
    query_id: str | None = None


def load_historical_dataset(db_session) -> list[QuerySample]:
    """Retrieve genuine production query executions stored in SQLite query_history.

    Only retrieves records with actual measured execution_time_ms.
    """
    from api.models.orm import QueryHistory

    rows = (
        db_session.query(QueryHistory)
        .filter(QueryHistory.execution_time_ms.isnot(None))
        .filter(QueryHistory.execution_time_ms > 0)
        .all()
    )

    samples: list[QuerySample] = []
    for r in rows:
        samples.append(
            QuerySample(
                sql=r.sql_query,
                execution_time_ms=float(r.execution_time_ms),
                planning_time_ms=float(r.planning_time_ms) if r.planning_time_ms is not None else None,
                is_benchmark=bool(getattr(r, "is_benchmark", False)),
                query_id=r.id,
            )
        )
    logger.info("Loaded %d historical query executions from query_history", len(samples))
    return samples


def seed_benchmark_database(conn: sqlite3.Connection) -> None:
    """Create and populate realistic test tables with tens of thousands of rows."""
    cur = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            age INTEGER,
            country TEXT,
            signup_date TEXT,
            is_active INTEGER,
            balance REAL
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL,
            stock INTEGER,
            rating REAL
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            order_date TEXT,
            status TEXT,
            total REAL,
            payment_method TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY,
            order_id INTEGER,
            product_id INTEGER,
            quantity INTEGER,
            unit_price REAL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            action TEXT,
            created_at TEXT,
            response_ms REAL
        );

        CREATE INDEX IF NOT EXISTS idx_users_country ON users(country);
        CREATE INDEX IF NOT EXISTS idx_users_signup ON users(signup_date);
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
        CREATE INDEX IF NOT EXISTS idx_items_order_id ON order_items(order_id);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    """)

    # Check if already seeded
    cur.execute("SELECT count(*) FROM users")
    if cur.fetchone()[0] > 0:
        return

    random.seed(42)
    countries = ["US", "DE", "GB", "FR", "CA", "IN", "JP", "AU", "BR", "NL"]
    categories = ["Electronics", "Books", "Home", "Clothing", "Sports", "Health", "Toys", "Automotive"]
    statuses = ["completed", "pending", "cancelled", "refunded"]
    payments = ["credit_card", "paypal", "apple_pay", "bank_transfer"]
    actions = ["login", "view_product", "add_to_cart", "checkout", "logout", "search"]

    # 1. Users (5,000)
    users_data = [
        (
            i,
            f"User_{i}",
            f"user_{i}@example.com",
            random.randint(18, 75),
            random.choice(countries),
            f"202{random.randint(1, 5)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
            1 if random.random() > 0.1 else 0,
            round(random.uniform(0.0, 5000.0), 2),
        )
        for i in range(1, 5001)
    ]
    cur.executemany("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)", users_data)

    # 2. Products (1,000)
    products_data = [
        (
            i,
            f"Product_{i}",
            random.choice(categories),
            round(random.uniform(5.0, 1500.0), 2),
            random.randint(0, 500),
            round(random.uniform(1.0, 5.0), 1),
        )
        for i in range(1, 1001)
    ]
    cur.executemany("INSERT INTO products VALUES (?, ?, ?, ?, ?, ?)", products_data)

    # 3. Orders (15,000)
    orders_data = [
        (
            i,
            random.randint(1, 5000),
            f"202{random.randint(3, 5)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
            random.choice(statuses),
            round(random.uniform(10.0, 2500.0), 2),
            random.choice(payments),
        )
        for i in range(1, 15001)
    ]
    cur.executemany("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)", orders_data)

    # 4. Order Items (30,000)
    items_data = [
        (
            i,
            random.randint(1, 15000),
            random.randint(1, 1001),
            random.randint(1, 5),
            round(random.uniform(5.0, 500.0), 2),
        )
        for i in range(1, 30001)
    ]
    cur.executemany("INSERT INTO order_items VALUES (?, ?, ?, ?, ?)", items_data)

    # 5. Access Logs (20,000)
    logs_data = [
        (
            i,
            random.randint(1, 5000),
            random.choice(actions),
            f"202{random.randint(4, 5)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
            round(random.uniform(5.0, 800.0), 2),
        )
        for i in range(1, 20001)
    ]
    cur.executemany("INSERT INTO access_logs VALUES (?, ?, ?, ?, ?)", logs_data)

    conn.commit()
    logger.info("Seeded benchmark database successfully with realistic data")


def generate_benchmark_queries(num_queries: int = 500) -> list[str]:
    """Generate diverse SQL queries with varying join depths, aggregations, and filters."""
    random.seed(1337)
    queries: list[str] = []
    countries = ["US", "DE", "GB", "FR", "CA", "IN", "JP"]
    categories = ["Electronics", "Books", "Home", "Clothing", "Sports"]
    statuses = ["completed", "pending", "cancelled"]

    # 1. Point lookups and single-table scans
    for _ in range(num_queries // 5):
        c = random.choice(countries)
        age = random.randint(20, 60)
        lim = random.choice([10, 50, 100, 500, 1000])
        queries.append(f"SELECT * FROM users WHERE country = '{c}' AND age > {age} LIMIT {lim}")
        cat = random.choice(categories)
        queries.append(f"SELECT id, name, price FROM products WHERE category = '{cat}' AND price > 100 ORDER BY price DESC LIMIT {lim}")
        queries.append(f"SELECT count(*) FROM users WHERE is_active = 1 AND balance > 500")

    # 2. Two-table joins
    for _ in range(num_queries // 4):
        st = random.choice(statuses)
        lim = random.choice([20, 100, 500])
        queries.append(
            f"SELECT u.name, o.id, o.total, o.order_date FROM users u "
            f"JOIN orders o ON u.id = o.user_id WHERE o.status = '{st}' "
            f"ORDER BY o.total DESC LIMIT {lim}"
        )
        queries.append(
            f"SELECT u.country, count(o.id) as order_cnt, sum(o.total) as gmv "
            f"FROM users u LEFT JOIN orders o ON u.id = o.user_id "
            f"GROUP BY u.country HAVING count(o.id) > 10"
        )

    # 3. Multi-table joins (3-4 tables)
    for _ in range(num_queries // 4):
        cat = random.choice(categories)
        queries.append(
            f"SELECT u.id, u.name, p.name, oi.quantity, oi.unit_price "
            f"FROM users u "
            f"JOIN orders o ON u.id = o.user_id "
            f"JOIN order_items oi ON o.id = oi.order_id "
            f"JOIN products p ON oi.product_id = p.id "
            f"WHERE p.category = '{cat}' "
            f"ORDER BY oi.quantity DESC LIMIT 50"
        )
        queries.append(
            f"SELECT p.category, count(distinct o.user_id) as buyers, sum(oi.quantity * oi.unit_price) as rev "
            f"FROM orders o "
            f"JOIN order_items oi ON o.id = oi.order_id "
            f"JOIN products p ON oi.product_id = p.id "
            f"WHERE o.status = 'completed' "
            f"GROUP BY p.category ORDER BY rev DESC"
        )

    # 4. Complex subqueries & CTEs
    for _ in range(num_queries // 5):
        c = random.choice(countries)
        queries.append(
            f"WITH high_spenders AS ("
            f"  SELECT user_id, sum(total) as spend FROM orders GROUP BY user_id HAVING sum(total) > 1500"
            f") "
            f"SELECT u.name, u.country, h.spend FROM users u "
            f"JOIN high_spenders h ON u.id = h.user_id WHERE u.country = '{c}'"
        )
        queries.append(
            f"SELECT * FROM products WHERE id IN ("
            f"  SELECT product_id FROM order_items GROUP BY product_id HAVING count(*) > 20"
            f") ORDER BY rating DESC LIMIT 25"
        )

    return queries[:num_queries]


def execute_and_measure_benchmark_dataset(
    num_queries: int = 500,
    force_refresh: bool = False,
    cache_path: Path = BENCHMARK_CACHE_PATH,
) -> list[QuerySample]:
    """Execute benchmark queries on a real SQLite database to obtain genuine measured runtimes.

    Distinguishes every sample with is_benchmark=True.
    """
    if not force_refresh and cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            samples = [QuerySample(**item) for item in data]
            if len(samples) >= num_queries:
                logger.info("Loaded %d benchmark query executions from cache %s", len(samples), cache_path)
                return samples
        except Exception as exc:
            logger.warning("Could not load benchmark cache (%s), executing fresh benchmark...", exc)

    # Use a persistent or temp SQLite file
    db_file = Path("data/benchmark_seeded.db")
    db_file.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_file))

    try:
        seed_benchmark_database(conn)
        cur = conn.cursor()

        raw_queries = generate_benchmark_queries(num_queries)
        samples: list[QuerySample] = []

        # Warm up DB cache with first 5 queries
        for q in raw_queries[:5]:
            try:
                cur.execute(q)
                cur.fetchall()
            except Exception:
                pass

        for q in raw_queries:
            # Measure actual elapsed time
            start = time.perf_counter()
            try:
                cur.execute(q)
                cur.fetchall()
                elapsed_ms = (time.perf_counter() - start) * 1000.0
                samples.append(
                    QuerySample(
                        sql=q,
                        execution_time_ms=round(elapsed_ms, 3),
                        planning_time_ms=0.1,
                        is_benchmark=True,
                        query_id=f"bm_{len(samples)+1}",
                    )
                )
            except Exception as exc:
                logger.debug("Benchmark query failed to execute: %s (%s)", q, exc)

        logger.info("Executed and measured %d benchmark queries successfully", len(samples))

        # Save to cache
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump([asdict(s) for s in samples], f, indent=2)

        return samples
    finally:
        conn.close()


def prepare_training_dataset(
    db_session=None,
    num_benchmark_queries: int = 500,
) -> tuple[list[QuerySample], dict[str, int]]:
    """Combine genuine production executions with synthetic benchmark executions.

    Returns:
        (samples, stats_dict)
    """
    real_samples: list[QuerySample] = []
    if db_session is not None:
        try:
            real_samples = [s for s in load_historical_dataset(db_session) if not s.is_benchmark]
        except Exception as exc:
            logger.warning("Could not read from db_session: %s", exc)

    benchmark_samples = execute_and_measure_benchmark_dataset(num_queries=num_benchmark_queries)

    all_samples = real_samples + benchmark_samples
    stats = {
        "total_samples": len(all_samples),
        "real_samples": len(real_samples),
        "benchmark_samples": len(benchmark_samples),
    }
    logger.info("Prepared training dataset: %s", stats)
    return all_samples, stats
