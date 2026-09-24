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
    """Capability-neutral task lifecycle used by RADHA."""

    def __init__(self, emit: EventSink) -> None:
        self.emit = emit
        self.tasks: dict[str, Task] = {}
        self.cancelled: set[str] = set()

    def create_task(
        self,
        request: str,
        metadata: dict[str, Any] | None = None,
        task_id: str | None = None,
    ) -> Task:
        task = Task(
            task_id=task_id or str(uuid.uuid4()),
            request=request,
            metadata=metadata or {},
        )
        self.tasks[task.task_id] = task
        return task

    async def transition(
        self,
        task: Task,
        state: TaskState,
        **payload: Any,
    ) -> None:
        task.state = state
        await self.emit(
            {
                "type": "state_changed",
                "task_id": task.task_id,
                "state": state.value,
                "timestamp": time.time(),
                **payload,
            }
        )

    async def event(
        self,
        task: Task,
        event_type: str,
        **payload: Any,
    ) -> None:
        await self.emit(
            {
                "type": event_type,
                "task_id": task.task_id,
                "timestamp": time.time(),
                **payload,
            }
        )

    def cancel(self, task_id: str) -> bool:
        task = self.tasks.get(task_id)
        if task is None:
            return False
        self.cancelled.add(task_id)
        task.state = TaskState.CANCELLED
        return True

    def is_cancelled(self, task_id: str) -> bool:
        return task_id in self.cancelled
