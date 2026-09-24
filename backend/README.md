# RADHA Backend

FastAPI runtime for the RADHA autonomous engineering agent.

## Run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn main:app --reload
```

RADHA uses OmniRoute as its model gateway. Configure `OMNIROUTE_BASE_URL` (default `http://127.0.0.1:20128/v1`) and optionally `OMNIROUTE_API_KEY`. The default model is `auto/coding`, so OmniRoute can select and fail over across connected coding-capable models/providers instead of binding RADHA to one model.

## API

- `GET /health`
- `GET /workspace/tree`
- `GET /workspace/file?path=...`
- `POST /tasks`
- `POST /tasks/{task_id}/cancel`
- `POST /tasks/{task_id}/approvals/{approval_id}`
- `WS /ws/tasks/{task_id}`

## Execution boundary

File operations are restricted to the configured workspace. Commands run with `shell=False`, a timeout, a restricted environment, bounded output, and command-policy checks.

This is not a hostile-code sandbox. Public or multi-tenant execution must move to a disposable container or VM with OS resource limits and network isolation before production exposure. After RADHA mutates files, the engine also enforces a verification gate: it will request a relevant successful execution before reporting the mission as completed.


## OmniRoute

OmniRoute exposes an OpenAI-compatible chat endpoint, so RADHA only depends on the gateway contract. Useful routing modes include:

- `auto` for balanced routing
- `auto/coding` for coding-focused routing
- `auto/smart` for quality-first routing
- a specific provider/model when you explicitly need one

RADHA records OmniRoute's routing decision when the gateway returns `X-OmniRoute-Decision`.
