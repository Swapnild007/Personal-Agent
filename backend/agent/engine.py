from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from openai import AsyncOpenAI

from config import MAX_TOOL_ROUNDS, OPENAI_API_KEY, OPENAI_MODEL
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
    SYSTEM_PROMPT = """You are RADHA, Robust Automated Developer & Heuristic Architect.
You are an autonomous software engineering agent operating only inside the assigned workspace.

Workflow:
1. Understand the requested outcome.
2. Inspect the workspace before editing.
3. Form a concise implementation plan internally.
4. Make the smallest safe edits necessary.
5. Run relevant tests, linters, type checks, or builds.
6. If a check fails, diagnose and repair, then rerun it.
7. Report what changed and the verification result.

Rules:
- Never invent files or command output. Inspect first.
- Never read or modify paths outside the workspace.
- Prefer patch_file for surgical edits and write_file for new or whole files.
- Destructive filesystem commands and repository-mutating git commands require human approval.
- Never claim a test or build passed unless execute_command returned success.
- Avoid unrelated refactors.
"""

    def __init__(self, tools: ToolRegistry, emit: EventSink) -> None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        self.client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        self.tools = tools
        self.emit = emit
        self.approvals = ApprovalGate()
        self.histories: dict[str, list[dict[str, Any]]] = {}
        self.cancelled: set[str] = set()

    async def run(self, task_id: str, request: str) -> None:
        history = self.histories.setdefault(
            task_id,
            [{"role": "system", "content": self.SYSTEM_PROMPT}],
        )
        history.append({"role": "user", "content": request})

        await self.emit(
            {
                "type": "status",
                "task_id": task_id,
                "status": "planning",
                "message": "RADHA is planning the task.",
            }
        )

        try:
            for round_number in range(1, MAX_TOOL_ROUNDS + 1):
                if task_id in self.cancelled:
                    await self.emit({"type": "cancelled", "task_id": task_id})
                    return

                response = await self.client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=history,
                    tools=self.tools.definitions(),
                    tool_choice="auto",
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
                    await self.emit(
                        {
                            "type": "completed",
                            "task_id": task_id,
                            "message": message.content or "",
                            "round": round_number,
                        }
                    )
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
                        await self.emit(
                            {
                                "type": "tool_finished",
                                "task_id": task_id,
                                "tool": name,
                                "result": result,
                                "round": round_number,
                            }
                        )
                        continue

                    await self.emit(
                        {
                            "type": "tool_started",
                            "task_id": task_id,
                            "tool": name,
                            "arguments": arguments,
                            "round": round_number,
                        }
                    )
                    result = await self._execute_with_approval(task_id, name, arguments)
                    history.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.id,
                            "content": json.dumps(result, ensure_ascii=False),
                        }
                    )
                    await self.emit(
                        {
                            "type": "tool_finished",
                            "task_id": task_id,
                            "tool": name,
                            "result": result,
                            "round": round_number,
                        }
                    )

            await self.emit(
                {
                    "type": "failed",
                    "task_id": task_id,
                    "error": "Maximum tool rounds reached.",
                }
            )
        except asyncio.CancelledError:
            await self.emit({"type": "cancelled", "task_id": task_id})
            raise
        except Exception as exc:
            await self.emit(
                {
                    "type": "failed",
                    "task_id": task_id,
                    "error": str(exc),
                }
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
                await self.emit(
                    {
                        "type": "approval_required",
                        "task_id": task_id,
                        "approval_id": approval_id,
                        "action": approval.action,
                        "reason": approval.reason,
                        "command": command,
                    }
                )
                approved = await future
                if not approved:
                    return {
                        "status": "denied",
                        "reason": "Human approval was denied.",
                        "command": command,
                    }
                return await self.tools.execute(
                    name,
                    arguments,
                    approved=True,
                )

        return await self.tools.execute(name, arguments)

    def approve(self, approval_id: str) -> bool:
        return self.approvals.resolve(approval_id, True)

    def deny(self, approval_id: str) -> bool:
        return self.approvals.resolve(approval_id, False)

    def cancel(self, task_id: str) -> None:
        self.cancelled.add(task_id)
