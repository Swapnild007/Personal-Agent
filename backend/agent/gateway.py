from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class GatewayResponse:
    """Normalized OpenAI-compatible response returned by OmniRoute."""

    choices: list[Any]
    model: str | None = None
    decision: str | None = None
    usage: dict[str, Any] | None = None


class OmniRouteModelGateway:
    """RADHA model boundary backed by the OmniRoute multi-provider gateway."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: int = 120,
    ) -> None:
        if not base_url:
            raise ValueError("OMNIROUTE_BASE_URL is not configured.")

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(timeout_seconds),
        )

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> GatewayResponse:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        response = await self.client.post(
            "/chat/completions",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

        choices = []
        for choice in data.get("choices", []):
            message = choice.get("message", {})
            tool_calls = []
            for call in message.get("tool_calls") or []:
                function = call.get("function") or {}
                tool_calls.append(
                    type(
                        "ToolCall",
                        (),
                        {
                            "id": call.get("id", ""),
                            "function": type(
                                "FunctionCall",
                                (),
                                {
                                    "name": function.get("name", ""),
                                    "arguments": function.get("arguments", "{}"),
                                },
                            )(),
                        },
                    )()
                )

            choices.append(
                type(
                    "Choice",
                    (),
                    {
                        "message": type(
                            "Message",
                            (),
                            {
                                "content": message.get("content") or "",
                                "tool_calls": tool_calls,
                            },
                        )(),
                    },
                )()
            )

        return GatewayResponse(
            choices=choices,
            model=data.get("model"),
            decision=response.headers.get("X-OmniRoute-Decision"),
            usage=data.get("usage"),
        )

    async def close(self) -> None:
        await self.client.aclose()
