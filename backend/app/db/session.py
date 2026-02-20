import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


def _build_database_url() -> str:
    """
    Prefer DATABASE_URL when provided; otherwise derive a Cloud SQL connection
    string from DB_* env vars, falling back to local SQLite for development.
    """

    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url

    db_instance = os.getenv("DB_INSTANCE")
    db_user = os.getenv("DB_USER")
    db_pass = os.getenv("DB_PASS")
    db_name = os.getenv("DB_NAME")
    if all([db_instance, db_user, db_pass, db_name]):
        host = os.getenv("DB_HOST", f"/cloudsql/{db_instance}")
        if host.startswith("/"):
            return f"postgresql+psycopg2://{db_user}:{db_pass}@/{db_name}?host={host}"
        return f"postgresql+psycopg2://{db_user}:{db_pass}@{host}/{db_name}"

    return "sqlite:///./netatron.db"


DATABASE_URL = _build_database_url()
ENGINE_KWARGS = {"pool_pre_ping": True}

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_engine(DATABASE_URL, connect_args=connect_args, **ENGINE_KWARGS)
else:
    engine = create_engine(DATABASE_URL, **ENGINE_KWARGS)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
