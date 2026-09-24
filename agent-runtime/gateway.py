from __future__ import annotations

from typing import Any
from openai import AsyncOpenAI

class OpenAIModelGateway:
    """OpenAI-backed model gateway kept separate from agent orchestration."""
    def __init__(self, api_key: str, model: str = "gpt-4o", base_url: str | None = None) -> None:
        if not api_key:
            raise ValueError("An OpenAI API key is required.")
        kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = AsyncOpenAI(**kwargs)
        self.model = model

    async def run(self, *, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> Any:
        return await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=tools or None,
            tool_choice="auto" if tools else None,
        )
