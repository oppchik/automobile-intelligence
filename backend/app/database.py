import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

# Для локальной разработки по умолчанию используется SQLite (ноль настройки).
# В docker-compose/проде DATABASE_URL указывает на PostgreSQL, например:
#   postgresql+psycopg2://avto:avto@db:5432/avto_intellekt
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./avto_intellekt.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


ADDED_COLUMNS = {
    "history_entries": {"user_id": "INTEGER", "advisor": "JSON"},
}


def ensure_columns(bind):
    inspector = inspect(bind)
    with bind.begin() as conn:
        for table, columns in ADDED_COLUMNS.items():
            if not inspector.has_table(table):
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, sql_type in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))
