"""Internal SQLAlchemy setup for storing connection configs and query history."""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from typing import Generator

from core.config import settings

# Ensure the data directory exists for SQLite storage
if "sqlite" in settings.database_url:
    Path("data").mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    # SQLite needs this flag; ignored by other drivers
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=(settings.app_env == "development"),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables on startup and apply safe column migrations."""
    # Import models so Base registers them before create_all
    import api.models.orm  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _apply_migrations()


def _apply_migrations() -> None:
    """Safe, idempotent column additions for existing SQLite/Postgres tables."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "query_history" in table_names:
        columns = {col["name"] for col in inspector.get_columns("query_history")}
        with engine.begin() as conn:
            if "execution_time_ms" not in columns:
                conn.execute(text("ALTER TABLE query_history ADD COLUMN execution_time_ms FLOAT"))
            if "planning_time_ms" not in columns:
                conn.execute(text("ALTER TABLE query_history ADD COLUMN planning_time_ms FLOAT"))
            if "is_benchmark" not in columns:
                conn.execute(text("ALTER TABLE query_history ADD COLUMN is_benchmark BOOLEAN DEFAULT 0"))
