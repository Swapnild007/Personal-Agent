import asyncio
from pathlib import Path

import pytest

from agent.tools import CommandPolicy, ToolRegistry, Workspace, WorkspaceSecurityError


def test_workspace_rejects_escape(tmp_path: Path) -> None:
    workspace = Workspace(tmp_path / "workspace")
    with pytest.raises(WorkspaceSecurityError):
        workspace.resolve("../outside")


def test_patch_requires_unique_match(tmp_path: Path) -> None:
    tools = ToolRegistry(Workspace(tmp_path / "workspace"))
    tools.write_file("a.txt", "hello\nhello\n")

    with pytest.raises(RuntimeError, match="ambiguous"):
        tools.patch_file("a.txt", "hello", "bye")


def test_command_policy_requires_approval_for_rm_and_git_mutation() -> None:
    policy = CommandPolicy()

    assert policy.inspect("rm -rf build") is not None
    assert policy.inspect("git commit -m test") is not None
    assert policy.inspect("git status") is None
    assert policy.inspect("python -m pytest") is None


def test_shell_operators_are_rejected() -> None:
    policy = CommandPolicy()

    with pytest.raises(WorkspaceSecurityError):
        policy.inspect("python -m pytest && echo done")


def test_write_and_read_round_trip(tmp_path: Path) -> None:
    tools = ToolRegistry(Workspace(tmp_path / "workspace"))

    written = tools.write_file("src/example.py", "print('hello')\n")
    read = tools.read_file("src/example.py")

    assert written["status"] == "written"
    assert read["content"] == "print('hello')\n"


@pytest.mark.asyncio
async def test_command_streams_stdout(tmp_path: Path) -> None:
    tools = ToolRegistry(Workspace(tmp_path / "workspace"))
    chunks: list[tuple[str, str]] = []

    async def collect(stream: str, chunk: str) -> None:
        chunks.append((stream, chunk))

    result = await tools.execute_command_streaming(
        "python -c \"print('stream-ok')\"",
        on_output=collect,
    )

    assert result["status"] == "completed"
    assert "stream-ok" in result["stdout"]
    assert any(stream == "stdout" and "stream-ok" in chunk for stream, chunk in chunks)
