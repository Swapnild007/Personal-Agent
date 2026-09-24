import sqlite3
from datetime import datetime, timezone
from pathlib import Path


class MemoryStore:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(key)
            )
            """
        )
        self.db.commit()

    def set(self, key: str, value: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.db.execute(
            """
            INSERT INTO memories(key, value, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value=excluded.value,
                updated_at=excluded.updated_at
            """,
            (key, value, now, now),
        )
        self.db.commit()

    def get_all(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT key, value, updated_at FROM memories ORDER BY updated_at DESC"
        ).fetchall()
        return [{"key": k, "value": v, "updated_at": u} for k, v, u in rows]
