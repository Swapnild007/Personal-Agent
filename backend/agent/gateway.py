from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass(frozen=True)
class GatewayFunction:
    name: str
    arguments: str = "{}"


@dataclass(frozen=True)
class GatewayToolCall:
    id: str
    function: GatewayFunction


@dataclass(frozen=True)
class GatewayMessage:
    content: str = ""
    tool_calls: list[GatewayToolCall] = field(default_factory=list)


@dataclass(frozen=True)
class GatewayChoice:
    message: GatewayMessage


@dataclass
class GatewayResponse:
    """Normalized OpenAI-compatible response returned by OmniRoute."""

    choices: list[GatewayChoice]
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
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = response.text[:2000]
            raise RuntimeError(
                f"OmniRoute request failed with HTTP {response.status_code}: {detail}"
            ) from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise RuntimeError("OmniRoute returned invalid JSON.") from exc

        if not isinstance(data, dict):
            raise RuntimeError("OmniRoute returned an invalid response object.")

        choices: list[GatewayChoice] = []
        for choice in data.get("choices", []) or []:
            if not isinstance(choice, dict):
                continue
            raw_message = choice.get("message") or {}
            if not isinstance(raw_message, dict):
                continue

            tool_calls: list[GatewayToolCall] = []
            for raw_call in raw_message.get("tool_calls") or []:
                if not isinstance(raw_call, dict):
                    continue
                function = raw_call.get("function") or {}
                if not isinstance(function, dict):
                    continue
                tool_calls.append(
                    GatewayToolCall(
                        id=str(raw_call.get("id") or ""),
                        function=GatewayFunction(
                            name=str(function.get("name") or ""),
                            arguments=str(function.get("arguments") or "{}"),
                        ),
                    )
                )

            choices.append(
                GatewayChoice(
                    message=GatewayMessage(
                        content=str(raw_message.get("content") or ""),
                        tool_calls=tool_calls,
                    )
                )
            )

        return GatewayResponse(
            choices=choices,
            model=data.get("model"),
            decision=response.headers.get("X-OmniRoute-Decision"),
            usage=data.get("usage") if isinstance(data.get("usage"), dict) else None,
        )

    async def close(self) -> None:
        await self.client.aclose()
