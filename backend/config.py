from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = Path(
    os.getenv("RADHA_WORKSPACE_ROOT", str(BASE_DIR / "workspace"))
).resolve()

OMNIROUTE_BASE_URL = os.getenv("OMNIROUTE_BASE_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")
OMNIROUTE_MODEL = os.getenv("RADHA_MODEL", "auto/coding")
HOST = os.getenv("RADHA_HOST", "127.0.0.1")
PORT = int(os.getenv("RADHA_PORT", "8000"))
COMMAND_TIMEOUT_SECONDS = int(os.getenv("RADHA_COMMAND_TIMEOUT", "60"))
MAX_TOOL_ROUNDS = int(os.getenv("RADHA_MAX_TOOL_ROUNDS", "24"))
MAX_FILE_BYTES = int(
    os.getenv("RADHA_MAX_FILE_BYTES", str(2 * 1024 * 1024))
)
MAX_COMMAND_OUTPUT_BYTES = int(
    os.getenv("RADHA_MAX_COMMAND_OUTPUT_BYTES", str(256 * 1024))
)
MAX_DIRECTORY_ENTRIES = int(os.getenv("RADHA_MAX_DIRECTORY_ENTRIES", "500"))
CORS_ORIGINS = [
    value.strip()
    for value in os.getenv(
        "RADHA_CORS_ORIGINS",
        "http://localhost:3000",
        "https://swapnild007.github.io",
    ).split(",")
    if value.strip()
]

WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
