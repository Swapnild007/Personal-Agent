from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent.engine import RadhaEngine
from agent.tools import ToolRegistry
from config import CORS_ORIGINS, HOST, OMNIROUTE_BASE_URL, OMNIROUTE_MODEL, PORT, WORKSPACE_ROOT


class ConnectionHub:
    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = {}
        self.events: dict[str, list[dict[str, Any]]] = {}

    async def publish(self, event: dict[str, Any]) -> None:
        task_id = event["task_id"]
        self.events.setdefault(task_id, []).append(event)

        dead: list[WebSocket] = []
        for websocket in self.connections.get(task_id, set()):
            try:
                await websocket.send_json(event)
            except Exception:
                dead.append(websocket)

        for websocket in dead:
            self.connections.get(task_id, set()).discard(websocket)

    async def connect(self, task_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(task_id, set()).add(websocket)

        for event in self.events.get(task_id, []):
            await websocket.send_json(event)

    def disconnect(self, task_id: str, websocket: WebSocket) -> None:
        connections = self.connections.get(task_id)
        if connections is not None:
            connections.discard(websocket)
            if not connections:
                self.connections.pop(task_id, None)


hub = ConnectionHub()
tools = ToolRegistry()
engine: RadhaEngine | None = None
engine_error: str | None = None
running_tasks: dict[str, asyncio.Task[None]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, engine_error

    if OMNIROUTE_BASE_URL:
        try:
            engine = RadhaEngine(tools, hub.publish)
            engine_error = None
        except Exception as exc:
            engine = None
            engine_error = str(exc)
    else:
        engine = None
        engine_error = "OMNIROUTE_BASE_URL is not configured."

    yield

    for task in list(running_tasks.values()):
        task.cancel()

    if engine is not None:
        engine.approvals.cancel_all()
        await engine.gateway.close()


app = FastAPI(
    title="RADHA Agent Runtime",
    version="0.6.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskRequest(BaseModel):
    request: str = Field(min_length=1, max_length=12000)


class ApprovalRequest(BaseModel):
    approved: bool


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "agent": "RADHA",
        "runtime": "coding-capability",
        "workspace": str(WORKSPACE_ROOT),
        "model_configured": engine is not None,
        "model_gateway": "OmniRoute",
        "model": OMNIROUTE_MODEL,
        "omniroute_base_url": OMNIROUTE_BASE_URL,
        "running_tasks": len(running_tasks),
    }






@app.get("/workspace/file")
async def workspace_file(path: str) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(tools.read_file, path)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/workspace/tree")
async def workspace_tree() -> dict[str, Any]:
    try:
        return await asyncio.to_thread(tools.tree, ".")
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/tasks")
async def create_task(payload: TaskRequest) -> dict[str, str]:
    if engine is None:
        raise HTTPException(
            503,
            engine_error or "Agent engine is not ready.",
        )

    task_id = str(uuid.uuid4())
    task = asyncio.create_task(engine.run(task_id, payload.request))
    running_tasks[task_id] = task

    def cleanup(_: asyncio.Task[None]) -> None:
        running_tasks.pop(task_id, None)

    task.add_done_callback(cleanup)
    return {"task_id": task_id, "status": "started"}


@app.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str) -> dict[str, str]:
    if engine is None:
        raise HTTPException(
            503,
            engine_error or "Agent engine is not ready.",
        )

    if task_id not in engine.runtime.tasks:
        raise HTTPException(404, "Task not found.")

    engine.cancel(task_id)
    task = running_tasks.get(task_id)
    if task is not None and not task.done():
        task.cancel()

    return {"task_id": task_id, "status": "cancellation_requested"}


@app.post("/tasks/{task_id}/approvals/{approval_id}")
async def resolve_approval(
    task_id: str,
    approval_id: str,
    payload: ApprovalRequest,
) -> dict[str, Any]:
    if engine is None:
        raise HTTPException(
            503,
            engine_error or "Agent engine is not ready.",
        )

    task = engine.runtime.tasks.get(task_id)
    if task is None:
        raise HTTPException(404, "Task not found.")

    resolved = (
        engine.approve(approval_id)
        if payload.approved
        else engine.deny(approval_id)
    )
    if not resolved:
        raise HTTPException(
            404,
            "Approval request is unknown or already resolved.",
        )

    return {
        "task_id": task_id,
        "approval_id": approval_id,
        "approved": payload.approved,
    }


@app.websocket("/ws/tasks/{task_id}")
async def task_stream(websocket: WebSocket, task_id: str) -> None:
    await hub.connect(task_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(task_id, websocket)
    except Exception:
        hub.disconnect(task_id, websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
