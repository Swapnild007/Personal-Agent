import asyncio

from agent.runtime import AgentRuntime, TaskState


def test_runtime_creates_and_transitions_tasks() -> None:
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    async def scenario() -> None:
        runtime = AgentRuntime(emit)
        task = runtime.create_task("inspect repository")
        assert task.state is TaskState.QUEUED

        await runtime.transition(task, TaskState.PLANNING)
        assert task.state is TaskState.PLANNING

        assert any(event["type"] == "state_changed" for event in events)

    asyncio.run(scenario())


def test_runtime_cancellation() -> None:
    async def emit(_: dict) -> None:
        return None

    runtime = AgentRuntime(emit)
    task = runtime.create_task("cancel me")

    assert runtime.cancel(task.task_id) is True
    assert runtime.is_cancelled(task.task_id) is True
    assert task.state is TaskState.CANCELLED
