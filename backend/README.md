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

Set `OPENAI_API_KEY` before creating tasks.

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

This is not a hostile-code sandbox. Public or multi-tenant execution must move to a disposable container or VM with OS resource limits and network isolation before production exposure.
