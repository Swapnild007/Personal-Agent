from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable

class TaskState(str, Enum):
    QUEUED = "queued"
    PLANNING = "planning"
    EXECUTING = "executing"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class Task:
    task_id: str
    request: str
    state: TaskState = TaskState.QUEUED
    created_at: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)

EventSink = Callable[[dict[str, Any]], Awaitable[None]]

class AgentRuntime:
    """Provider-agnostic lifecycle/state foundation for RADHA capabilities."""
    def __init__(self, emit: EventSink | None = None) -> None:
        self.emit = emit or self._noop
        self.tasks: dict[str, Task] = {}
        self._cancelled: set[str] = set()

    async def create_task(self, request: str, metadata: dict[str, Any] | None = None) -> Task:
        task = Task(task_id=str(uuid.uuid4()), request=request, metadata=metadata or {})
        self.tasks[task.task_id] = task
        await self._event(task, "task_created", request=request)
        return task

    async def transition(self, task: Task, state: TaskState, **payload: Any) -> None:
        task.state = state
        await self._event(task, "state_changed", state=state.value, **payload)

    def cancel(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if not task:
            return False
        self._cancelled.add(task_id)
        task.state = TaskState.CANCELLED
        return True

    def is_cancelled(self, task_id: str) -> bool:
        return task_id in self._cancelled

    async def _event(self, task: Task, event_type: str, **payload: Any) -> None:
        await self.emit({"type": event_type, "task_id": task.task_id, "timestamp": time.time(), **payload})

    @staticmethod
    async def _noop(_: dict[str, Any]) -> None:
        return None
