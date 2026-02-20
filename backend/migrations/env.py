import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.db.base import Base  # noqa: E402
from app.db import models  # noqa: F401,E402


def _build_database_url() -> str:
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


config = context.config
config.set_main_option("sqlalchemy.url", _build_database_url())

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
