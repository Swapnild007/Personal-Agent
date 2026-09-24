from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from config import (\n    MAX_TOOL_ROUNDS,\n    OPENAI_API_KEY,\n    OPENAI_BASE_URL,\n    OPENAI_MODEL,\n)
from .gateway import OpenAIModelGateway
from .planner import Planner
from .runtime import AgentRuntime, TaskState
from .tools import ToolRegistry

EventSink = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass
class ApprovalGate:
    pending: dict[str, asyncio.Future[bool]] = field(default_factory=dict)

    def request(self) -> tuple[str, asyncio.Future[bool]]:
        approval_id = str(uuid.uuid4())
        future: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
        self.pending[approval_id] = future
        return approval_id, future

    def resolve(self, approval_id: str, approved: bool) -> bool:
        future = self.pending.pop(approval_id, None)
        if future is None or future.done():
            return False
        future.set_result(approved)
        return True

    def cancel_all(self) -> None:
        for future in self.pending.values():
            if not future.done():
                future.cancel()
        self.pending.clear()


class RadhaEngine:
    def __init__(self, tools: ToolRegistry, emit: EventSink) -> None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        self.emit = emit
        self.tools = tools
        self.runtime = AgentRuntime(emit)
        self.gateway = OpenAIModelGateway(
            api_key=OPENAI_API_KEY,
            model=OPENAI_MODEL,
            base_url=OPENAI_BASE_URL or None,
        )
        self.planner = Planner()
        self.approvals = ApprovalGate()
        self.histories: dict[str, list[dict[str, Any]]] = {}

    async def run(self, task_id: str, request: str) -> None:
        task = self.runtime.create_task(request, task_id=task_id)
        history = self.histories.setdefault(
            task_id,
            self.planner.messages(request),
        )

        await self.runtime.transition(task, TaskState.PLANNING)

        try:
            for round_number in range(1, MAX_TOOL_ROUNDS + 1):
                if self.runtime.is_cancelled(task_id):
                    await self.runtime.event(task, "task_cancelled")
                    return

                await self.runtime.transition(
                    task,
                    TaskState.EXECUTING,
                    round=round_number,
                )

                response = await self.gateway.complete(
                    messages=history,
                    tools=self.tools.definitions(),
                )
                message = response.choices[0].message

                assistant_message: dict[str, Any] = {
                    "role": "assistant",
                    "content": message.content or "",
                }
                if message.tool_calls:
                    assistant_message["tool_calls"] = [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.function.name,
                                "arguments": call.function.arguments,
                            },
                        }
                        for call in message.tool_calls
                    ]

                history.append(assistant_message)

                if not message.tool_calls:
                    await self.runtime.transition(
                        task,
                        TaskState.VERIFYING,
                        round=round_number,
                    )
                    await self.runtime.event(
                        task,
                        "task_completed",
                        message=message.content or "",
                        round=round_number,
                    )
                    await self.runtime.transition(task, TaskState.COMPLETED)
                    return

                for call in message.tool_calls:
                    name = call.function.name

                    try:
                        arguments = json.loads(call.function.arguments or "{}")
                    except json.JSONDecodeError as exc:
                        result = {
                            "status": "error",
                            "error": f"Invalid tool arguments: {exc}",
                        }
                        history.append(
                            {
                                "role": "tool",
                                "tool_call_id": call.id,
                                "content": json.dumps(result),
                            }
                        )
                        await self.runtime.event(
                            task,
                            "tool_finished",
                            tool=name,
                            result=result,
                            round=round_number,
                        )
                        continue

                    await self.runtime.event(
                        task,
                        "tool_started",
                        tool=name,
                        arguments=arguments,
                        round=round_number,
                    )

                    result = await self._execute_with_approval(
                        task_id,
                        name,
                        arguments,
                    )

                    history.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": json.dumps(
                                result,
                                ensure_ascii=False,
                            ),
                        }
                    )

                    await self.runtime.event(
                        task,
                        "tool_finished",
                        tool=name,
                        result=result,
                        round=round_number,
                    )

            await self.runtime.transition(task, TaskState.FAILED)
            await self.runtime.event(
                task,
                "task_failed",
                error="Maximum tool rounds reached.",
            )

        except asyncio.CancelledError:
            self.runtime.cancel(task_id)
            await self.runtime.event(task, "task_cancelled")
            raise
        except Exception as exc:
            await self.runtime.transition(task, TaskState.FAILED)
            await self.runtime.event(
                task,
                "task_failed",
                error=str(exc),
            )

    async def _execute_with_approval(
        self,
        task_id: str,
        name: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        if name == "execute_command":
            command = arguments.get("command", "")
            approval = self.tools.policy.inspect(command)

            if approval:
                approval_id, future = self.approvals.request()
                task = self.runtime.tasks[task_id]

                await self.runtime.transition(
                    task,
                    TaskState.WAITING_FOR_APPROVAL,
                    approval_id=approval_id,
                )
                await self.runtime.event(
                    task,
                    "approval_required",
                    approval_id=approval_id,
                    action=approval.action,
                    reason=approval.reason,
                    command=command,
                )

                try:
                    approved = await future
                finally:
                    self.approvals.pending.pop(approval_id, None)

                await self.runtime.transition(task, TaskState.EXECUTING)

                if not approved:
                    await self.runtime.event(
                        task,
                        "approval_resolved",
                        approval_id=approval_id,
                        approved=False,
                    )
                    return {
                        "status": "denied",
                        "reason": "Human approval was denied.",
                        "command": command,
                    }

                await self.runtime.event(
                    task,
                    "approval_resolved",
                    approval_id=approval_id,
                    approved=True,
                )
                return await self._execute_tool(
                    task_id,
                    name,
                    arguments,
                    approved=True,
                )

        return await self._execute_tool(task_id, name, arguments)

    async def _execute_tool(
        self,
        task_id: str,
        name: str,
        arguments: dict[str, Any],
        *,
        approved: bool = False,
    ) -> dict[str, Any]:
        if name == "execute_command":
            async def on_output(stream: str, chunk: str) -> None:
                task = self.runtime.tasks[task_id]
                await self.runtime.event(
                    task,
                    "tool_output",
                    tool=name,
                    stream=stream,
                    chunk=chunk,
                )

            return await self.tools.execute_command_streaming(
                arguments["command"],
                approved=approved,
                on_output=on_output,
            )

        return await self.tools.execute(name, arguments, approved=approved)

    def approve(self, approval_id: str) -> bool:
        return self.approvals.resolve(approval_id, True)

    def deny(self, approval_id: str) -> bool:
        return self.approvals.resolve(approval_id, False)

    def cancel(self, task_id: str) -> None:
        self.runtime.cancel(task_id)
