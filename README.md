# RADHA Personal-Agent

A single-user personal AI agent built from scratch.

## Actual agent count

One AI agent: Radha.

Radha is not three separate agents. The product has one orchestrator, one shared memory store, and three operating modes:

1. General: everyday questions, research, planning and writing.
2. Coding: code generation, debugging, review and testing.
3. Tutor: adaptive teaching, exercises and assessment.

Changing mode changes the operating instructions. It does not create another model, memory store, or agent.

## Current backend

- FastAPI
- Cloud LLM only
- OpenAI-compatible chat completions endpoint
- SQLite long-term memory
- Explicit tool registry
- remember, recall and web_fetch tools
- Bounded tool-call loop
- No unrestricted shell access
- No model weights on the device

The GitHub Pages UI is a client-side prototype. Real cloud-agent conversations require the Python backend to be deployed and configured with LLM_API_KEY and LLM_MODEL.

## UI

RADHA is a mobile-first AI companion interface based on the supplied reference composition:

- RADHA female companion identity
- Splash / welcome screen
- Home screen
- Premium feature cards
- Recently used cards
- Speech-to-text interaction
- Fixed mobile navigation
- Responsive desktop shell
- CSS-rendered animated companion
- Reference screenshots are not embedded in the project

Figma design:
https://www.figma.com/design/sQ4Ex7iJZmeqQrpb2Ksj7F

## Setup

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

Set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, DATABASE_PATH and MAX_TOOL_ROUNDS.

Run:
uvicorn app:app --reload --host 0.0.0.0 --port 8000

Health:
GET /health

Chat:
POST /chat with message, conversation_id and mode.

## Architecture

RADHA -> Agent Orchestrator -> Cloud LLM
                         -> Tool Registry -> Memory
                                         -> Web fetch
                         -> SQLite

Modes: General / Coding / Tutor

## Roadmap

1. Connect the RADHA UI to the API
2. Browser automation
3. GitHub tools
4. File intelligence
5. Scheduled/proactive tasks
6. Approval and audit system
7. Evaluation suite
