from __future__ import annotations

from typing import Any

class Planner:
    """Capability-neutral planning boundary."""
    def build_system_prompt(self) -> str:
        return ("You are RADHA, a general autonomous agent. Understand the user goal, "
                "choose authorized capabilities and tools, observe results, adapt when necessary, "
                "verify important outcomes, and never claim success without tool evidence.")

    def initial_messages(self, request: str) -> list[dict[str, Any]]:
        return [{"role": "system", "content": self.build_system_prompt()}, {"role": "user", "content": request}]

    @staticmethod
    def summarize_tool_result(result: Any) -> str:
        return str(result)
