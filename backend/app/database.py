import os
from sqlalchemy import create_engine
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
