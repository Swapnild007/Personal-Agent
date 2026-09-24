import asyncio

import httpx

from agent.gateway import OmniRouteModelGateway


def test_gateway_normalizes_chat_and_tool_calls() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat/completions"
        body = request.read()
        assert b'"model":"auto/coding"' in body
        return httpx.Response(
            200,
            headers={"X-OmniRoute-Decision": "provider-a/model-x"},
            json={
                "model": "provider-a/model-x",
                "choices": [
                    {
                        "message": {
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {
                                        "name": "read_file",
                                        "arguments": '{"path":"README.md"}',
                                    },
                                }
                            ],
                        }
                    }
                ],
            },
        )

    async def scenario() -> None:
        gateway = OmniRouteModelGateway(
            base_url="http://omniroute.test/v1",
            api_key="test-key",
            model="auto/coding",
        )
        await gateway.client.aclose()
        gateway.client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
            base_url=gateway.base_url,
        )

        response = await gateway.complete(
            messages=[{"role": "user", "content": "inspect README"}],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "description": "Read a file",
                        "parameters": {"type": "object"},
                    },
                }
            ],
        )

        assert response.model == "provider-a/model-x"
        assert response.decision == "provider-a/model-x"
        assert response.choices[0].message.tool_calls[0].function.name == "read_file"
        assert response.choices[0].message.tool_calls[0].function.arguments == '{"path":"README.md"}'
        await gateway.close()

    asyncio.run(scenario())


def test_gateway_raises_for_http_errors() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "invalid key"}})

    async def scenario() -> None:
        gateway = OmniRouteModelGateway(
            base_url="http://omniroute.test/v1",
            api_key="bad",
            model="auto/coding",
        )
        await gateway.client.aclose()
        gateway.client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
            base_url=gateway.base_url,
        )

        try:
            await gateway.complete(
                messages=[{"role": "user", "content": "hello"}],
                tools=[],
            )
        except RuntimeError as exc:
            assert "HTTP 401" in str(exc)
        else:
            raise AssertionError("Expected OmniRoute HTTP error")
        finally:
            await gateway.close()

    asyncio.run(scenario())
