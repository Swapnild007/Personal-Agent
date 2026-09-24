# RADHA Backend

RADHA (Robust Automated Developer & Heuristic Architect) is an autonomous coding-agent backend.

## Runtime

- Python 3.11+
- FastAPI
- Official OpenAI Python SDK
- GPT-4o function calling
- Workspace-scoped filesystem tools
- Policy-gated subprocess execution
- WebSocket task events

## Run

    cd backend
    python -m venv .venv
    # macOS/Linux: source .venv/bin/activate
    # Windows: .venv\\Scripts\\activate
    pip install -r requirements.txt
    cp .env.example .env

Set OPENAI_API_KEY in .env, then:

    uvicorn main:app --reload

The API is available at http://127.0.0.1:8000.

## Endpoints

- GET /health
- GET /workspace/tree
- POST /tasks
- POST /tasks/{task_id}/cancel
- POST /tasks/{task_id}/approvals/{approval_id}
- WebSocket /ws/tasks/{task_id}

## Safety boundary

All filesystem paths are resolved under RADHA_WORKSPACE_ROOT.

Commands run with shell=False, a restricted environment, stdin disabled, a timeout, and output clipping. Shell operators are rejected. Destructive filesystem commands and repository-mutating Git commands pause for human approval.

This is a workspace-level isolation boundary, not a container or VM security boundary. For untrusted multi-tenant workloads, deploy the execution worker inside a disposable container or VM with OS-level resource limits and network isolation.
