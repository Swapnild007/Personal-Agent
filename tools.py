import json
from typing import Any

import httpx

from memory import MemoryStore


class ToolRegistry:
    def __init__(self, memory: MemoryStore):
        self.memory = memory

    def definitions(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "remember",
                    "description": "Save a durable fact or preference about the user or a project.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string"},
                            "value": {"type": "string"},
                        },
                        "required": ["key", "value"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "recall",
                    "description": "Read all durable memories currently stored.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "web_fetch",
                    "description": "Fetch a public webpage and return a bounded text extraction. Use for factual web research when a URL is known.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string"},
                        },
                        "required": ["url"],
                        "additionalProperties": False,
                    },
                },
            },
        ]

    async def execute(self, name: str, arguments: dict) -> dict:
        if name == "remember":
            self.memory.set(arguments["key"], arguments["value"])
            return {"ok": True}

        if name == "recall":
            return {"memories": self.memory.get_all()}

        if name == "web_fetch":
            url = arguments["url"]
            if not url.startswith(("https://", "http://")):
                return {"error": "Only HTTP(S) URLs are allowed."}
            try:
                async with httpx.AsyncClient(
                    follow_redirects=True, timeout=15,
                    headers={"User-Agent": "Personal-Agent/1.0"}
                ) as client:
                    response = await client.get(url)
                    response.raise_for_status()
                    text = response.text[:12000]
                return {"url": str(response.url), "status": response.status_code, "content": text}
            except Exception as exc:
                return {"error": str(exc)}

        return {"error": f"Unknown tool: {name}"}

    async def execute_tool_call(self, tool_call) -> dict:
        try:
            args = json.loads(tool_call["function"]["arguments"] or "{}")
        except json.JSONDecodeError:
            return {"error": "Tool arguments were not valid JSON."}
        return await self.execute(tool_call["function"]["name"], args)
