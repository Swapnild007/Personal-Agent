# Personal-Agent

A single-user personal AI agent built from scratch.

## V1 goals

- Cloud LLM only. No model weights stored on the device.
- Provider-agnostic OpenAI-compatible model API.
- Stateful conversations.
- Long-term memory with SQLite.
- Explicit tool registry.
- Web research tool.
- Human approval boundary for future side-effect tools.
- FastAPI API for a mobile/web client.
- Simple local development with Python.

## Architecture

```
Client
  |
  v
FastAPI
  |
  v
Agent Orchestrator
  |------> Cloud LLM
  |------> Tool Registry
  |          |--> Web
  |          |--> Memory
  |          |--> Future GitHub / Browser / Files
  |
  v
SQLite
```

The design deliberately starts small. Tools are explicit and auditable rather than giving the model unrestricted shell access.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` in `.env`.

Run:

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```
GET /health
```

Chat:

```
POST /chat
{
  "message": "Remember that my project is called Personal-Agent.",
  "conversation_id": "demo"
}
```

## Roadmap

1. Core agent + memory
2. Tool calling
3. Browser automation
4. GitHub actions
5. File intelligence
6. Scheduled/proactive agent
7. Mobile-first UI
8. Approval and audit system
9. Evaluation suite
