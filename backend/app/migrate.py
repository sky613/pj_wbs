"""Apply numbered SQL migrations atomically, once, under a database lock."""
from pathlib import Path
from app.db import connect


def migrate():
    with connect() as db:
        db.execute('SELECT pg_advisory_xact_lock(8172601)')
        db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
        for path in sorted((Path(__file__).resolve().parent.parent / 'migrations').glob('*.sql')):
            if not db.execute('SELECT 1 FROM schema_migrations WHERE version = %s', (path.name,)).fetchone():
                db.execute(path.read_text())
                db.execute('INSERT INTO schema_migrations(version) VALUES (%s)', (path.name,))
                print(f'Applied {path.name}', flush=True)


if __name__ == '__main__':
    migrate()
