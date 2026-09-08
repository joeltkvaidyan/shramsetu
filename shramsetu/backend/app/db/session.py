from sqlmodel import SQLModel, Session, create_engine

from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    # SQLite: single-file dev database, no real connection pool needed.
    engine = create_engine(
        settings.DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
    )
else:
    # Postgres (production): a real connection pool.
    # - pool_pre_ping: checks a connection is alive before handing it out,
    #   so the app recovers cleanly from a DB restart/network blip instead
    #   of surfacing a stale-connection error to the user.
    # - pool_recycle: recycle connections periodically so they don't get
    #   silently dropped by a load balancer/proxy's idle timeout.
    engine = create_engine(
        settings.DATABASE_URL,
        echo=False,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=1800,
    )


def init_db() -> None:
    """Creates tables if they don't exist yet — this is what runs on every
    app startup and is safe/idempotent (SQLModel.metadata.create_all only
    creates missing tables, it never alters existing ones).

    For actual schema changes in production, use Alembic migrations
    (backend/alembic/) instead of relying on this: `alembic upgrade head`.
    A real initial migration reflecting all current models is included in
    alembic/versions/. init_db() staying idempotent alongside that is
    intentional — it means a fresh dev environment (SQLite) works with zero
    migration setup, while production (Postgres) is expected to run
    migrations explicitly as part of deploy.
    """
    from app.models import user, document, chat, grievance, grievance_extras, otp  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
