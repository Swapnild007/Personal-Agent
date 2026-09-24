# RADHA · Personal Agent

RADHA (Robust Automated Developer & Heuristic Architect) is a single autonomous coding agent with a browser command-center UI and a FastAPI execution runtime.

## Current architecture

- Frontend: GitHub Pages static command center (index.html, radha-ui.js, radha-ui.css)
- Backend: FastAPI in backend/
- Model gateway: OmniRoute via an OpenAI-compatible /v1/chat/completions endpoint
- Default routing: auto/coding
- Agent loop: understand → inspect → act → observe → verify → report
- Live transport: WebSocket task events
- Safety: workspace path isolation, shell=False, bounded output, command policy and human approval for destructive/repository-mutating commands
- Verification gate: after workspace mutation, RADHA cannot mark the task complete until there is successful execution evidence

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn main:app --reload
```

Default backend: http://127.0.0.1:8000

Default OmniRoute: http://127.0.0.1:20128/v1

The browser UI stores the backend endpoint in Settings. For GitHub Pages, point that field at a reachable RADHA backend instead of assuming localhost.

## Backend API

- GET /health
- GET /workspace/tree
- GET /workspace/file?path=...
- POST /tasks
- POST /tasks/{task_id}/cancel
- POST /tasks/{task_id}/approvals/{approval_id}
- WS /ws/tasks/{task_id}

## Tests

The backend workflow runs:

```bash
python -m compileall -q agent main.py config.py
python -m pytest -q
```

Gateway tests use an HTTPX mock transport, so CI validates the OmniRoute request/response contract without requiring a live model provider.

## Security boundary

RADHA is designed for a trusted personal workspace, not hostile multi-tenant execution. Before exposing command execution to untrusted users, move execution into disposable containers or VMs with OS-level CPU, memory, filesystem and network isolation.

## Project structure

```text
backend/
  agent/
    engine.py
    gateway.py
    planner.py
    runtime.py
    tools.py
  tests/
  config.py
  main.py

index.html
radha-ui.js
radha-ui.css
```
