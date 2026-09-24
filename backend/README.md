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

## Termux: OmniRoute client authentication

OmniRoute's provider credentials (for example, a Cloudflare provider key) are not RADHA's client Bearer key. If the Dashboard cannot issue an endpoint key, OmniRoute v3.8.x also accepts a persistent passthrough key from its server process environment. Set the same locally generated value as `OMNIROUTE_API_KEY` in both the OmniRoute server process and RADHA's backend process, then restart both. Keep this key private and do not commit it.

Example for a single Termux shell session (replace the generated value only if you need to preserve an existing key):

```bash
export OMNIROUTE_API_KEY="$(openssl rand -hex 32)"
# Start/restart OmniRoute from this shell so it inherits the key:
omniroute serve
```

In a second Termux session, set the exact same value before starting RADHA:

```bash
cd ~/Personal-Agent/backend
export OMNIROUTE_API_KEY='paste-the-same-local-key-here'
uvicorn main:app --host 127.0.0.1 --port 8000
```

If OmniRoute is already managed by a background supervisor, stop it and relaunch it from a shell that has the variable exported; changing a shell variable does not update an already-running process. To verify, call `GET http://127.0.0.1:20128/v1/models` with `Authorization: Bearer <same-key>`. A 401 means the running OmniRoute process did not inherit that key or a Dashboard feature-flag/database override is still enforcing a different auth configuration. Do not disable authentication on a network-exposed listener.
