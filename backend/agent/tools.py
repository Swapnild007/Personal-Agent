from __future__ import annotations

import asyncio
import json
import os
import re
import shlex
import subprocess
import tempfile
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

from config import (
    COMMAND_TIMEOUT_SECONDS,
    MAX_COMMAND_OUTPUT_BYTES,
    MAX_DIRECTORY_ENTRIES,
    MAX_FILE_BYTES,
    WORKSPACE_ROOT,
)


class WorkspaceSecurityError(ValueError):
    """Raised when a requested workspace operation violates the security boundary."""


class ToolExecutionError(RuntimeError):
    """Raised when a tool cannot complete a valid requested operation."""


@dataclass(frozen=True)
class ApprovalRequest:
    action: str
    reason: str


class Workspace:
    def __init__(self, root: Path = WORKSPACE_ROOT) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve(self, relative_path: str, *, allow_root: bool = False) -> Path:
        if not relative_path:
            if allow_root:
                return self.root
            raise WorkspaceSecurityError("Path is required.")

        candidate = (self.root / relative_path).resolve()
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise WorkspaceSecurityError(
                "Path escapes the RADHA workspace."
            ) from exc

        if candidate == self.root and not allow_root:
            raise WorkspaceSecurityError("Workspace root is not a file path.")

        return candidate

    def relative(self, path: Path) -> str:
        return path.resolve().relative_to(self.root).as_posix()


class CommandPolicy:
    SHELL_META = re.compile(r"[;&|<>\x60$()]")
    CONTROL_CHARS = re.compile(r"[\n\r\x00]")
    ALWAYS_BLOCK = {
        "shutdown",
        "reboot",
        "poweroff",
        "halt",
        "mkfs",
        "fdisk",
        "parted",
        "mount",
        "umount",
        "iptables",
        "nft",
        "passwd",
        "useradd",
        "userdel",
        "chown",
        "chmod",
        "kill",
        "pkill",
        "killall",
        "dd",
    }
    DESTRUCTIVE_BINARIES = {"rm", "rmdir", "unlink", "shred", "truncate"}
    MUTATING_GIT = {
        "add",
        "commit",
        "checkout",
        "switch",
        "restore",
        "reset",
        "clean",
        "merge",
        "rebase",
        "cherry-pick",
        "revert",
        "tag",
        "push",
        "pull",
        "fetch",
        "clone",
        "remote",
        "branch",
    }

    def inspect(self, command: str) -> ApprovalRequest | None:
        if not command or len(command) > 2000:
            raise WorkspaceSecurityError("Command is empty or too long.")

        if self.CONTROL_CHARS.search(command):
            raise WorkspaceSecurityError(
                "Control characters and shell newlines are disabled."
            )

        try:
            lexer = shlex.shlex(command, posix=os.name != "nt", punctuation_chars=True)
            lexer.whitespace_split = True
            lexer.commenters = ""
            argv = list(lexer)
        except ValueError as exc:
            raise WorkspaceSecurityError(f"Invalid command syntax: {exc}") from exc

        if not argv:
            raise WorkspaceSecurityError("Command is empty.")

        shell_operators = {
            ";", "&&", "||", "|", "&", ">", ">>", "<", "<<",
            "2>", "2>>", "2>&1", "(", ")",
        }
        if any(token in shell_operators for token in argv):
            raise WorkspaceSecurityError(
                "Shell operators and shell interpolation are disabled."
            )
        if any("$" in token or "`" in token for token in argv):
            raise WorkspaceSecurityError(
                "Shell interpolation is disabled."
            )

        binary = Path(argv[0]).name.lower()
        if binary in self.ALWAYS_BLOCK:
            raise WorkspaceSecurityError(
                f"Command '{binary}' is blocked by policy."
            )

        if binary in self.DESTRUCTIVE_BINARIES:
            return ApprovalRequest(
                "destructive_command",
                f"'{binary}' can delete or irreversibly modify workspace data.",
            )

        if binary == "git" and len(argv) > 1:
            subcommand = argv[1].lower()
            if subcommand in self.MUTATING_GIT:
                return ApprovalRequest(
                    "git_mutation",
                    f"Git operation '{subcommand}' changes repository state.",
                )

        return None


class ToolRegistry:
    def __init__(self, workspace: Workspace | None = None) -> None:
        self.workspace = workspace or Workspace()
        self.policy = CommandPolicy()

    def definitions(self) -> list[dict[str, Any]]:
        def function(
            name: str,
            description: str,
            properties: dict[str, Any],
            required: list[str],
        ) -> dict[str, Any]:
            return {
                "type": "function",
                "function": {
                    "name": name,
                    "description": description,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required,
                        "additionalProperties": False,
                    },
                },
            }

        return [
            function(
                "list_directory",
                "List files and directories inside the isolated RADHA workspace.",
                {
                    "path": {
                        "type": "string",
                        "description": "Workspace-relative directory. Use . for the root.",
                    }
                },
                ["path"],
            ),
            function(
                "read_file",
                "Read a UTF-8 text file from the isolated workspace.",
                {"path": {"type": "string"}},
                ["path"],
            ),
            function(
                "write_file",
                "Create or replace a UTF-8 text file in the isolated workspace.",
                {"path": {"type": "string"}, "content": {"type": "string"}},
                ["path", "content"],
            ),
            function(
                "patch_file",
                "Apply one exact surgical replacement. Fails if search is absent or duplicated.",
                {
                    "path": {"type": "string"},
                    "search": {"type": "string"},
                    "replace": {"type": "string"},
                },
                ["path", "search", "replace"],
            ),
            function(
                "execute_command",
                "Run a non-interactive command in the isolated workspace. "
                "Shell operators are disabled. Destructive and repository-mutating "
                "commands require human approval.",
                {"command": {"type": "string"}},
                ["command"],
            ),
        ]

    async def execute(
        self,
        name: str,
        arguments: dict[str, Any],
        *,
        approved: bool = False,
    ) -> dict[str, Any]:
        methods = {
            "list_directory": self.list_directory,
            "read_file": self.read_file,
            "write_file": self.write_file,
            "patch_file": self.patch_file,
        }

        if name in methods:
            return await asyncio.to_thread(methods[name], **arguments)

        if name == "execute_command":
            return await asyncio.to_thread(
                self.execute_command,
                arguments["command"],
                approved,
            )

        raise ToolExecutionError(f"Unknown tool: {name}")

    def list_directory(self, path: str) -> dict[str, Any]:
        directory = self.workspace.resolve(path, allow_root=True)
        if not directory.exists() or not directory.is_dir():
            raise ToolExecutionError(f"Directory not found: {path}")

        entries = sorted(
            directory.iterdir(),
            key=lambda item: (not item.is_dir(), item.name.lower()),
        )[:MAX_DIRECTORY_ENTRIES]

        return {
            "path": self.workspace.relative(directory),
            "entries": [
                {
                    "name": item.name,
                    "type": "directory" if item.is_dir() else "file",
                }
                for item in entries
            ],
        }

    def tree(self, path: str) -> dict[str, Any]:
        directory = self.workspace.resolve(path, allow_root=True)
        if not directory.exists() or not directory.is_dir():
            raise ToolExecutionError(f"Directory not found: {path}")

        def build(current: Path, depth: int = 0) -> dict[str, Any]:
            if depth > 20:
                return {"name": current.name, "type": "directory", "truncated": True}

            children = sorted(
                current.iterdir(),
                key=lambda item: (not item.is_dir(), item.name.lower()),
            )[:MAX_DIRECTORY_ENTRIES]

            return {
                "name": current.name or ".",
                "type": "directory",
                "children": [
                    build(item, depth + 1)
                    if item.is_dir()
                    else {"name": item.name, "type": "file"}
                    for item in children
                ],
            }

        result = build(directory)
        result["path"] = self.workspace.relative(directory)
        return result

    def read_file(self, path: str) -> dict[str, Any]:
        file_path = self.workspace.resolve(path)
        if not file_path.exists() or not file_path.is_file():
            raise ToolExecutionError(f"File not found: {path}")

        size = file_path.stat().st_size
        if size > MAX_FILE_BYTES:
            raise ToolExecutionError(
                f"File exceeds RADHA_MAX_FILE_BYTES ({MAX_FILE_BYTES})."
            )

        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ToolExecutionError(
                "Only UTF-8 text files are supported by read_file."
            ) from exc

        return {
            "path": self.workspace.relative(file_path),
            "bytes": size,
            "content": content,
            "sha256": hashlib.sha256(file_path.read_bytes()).hexdigest(),
        }

    def write_file(self, path: str, content: str) -> dict[str, Any]:
        if len(content.encode("utf-8")) > MAX_FILE_BYTES:
            raise ToolExecutionError(
                f"Content exceeds RADHA_MAX_FILE_BYTES ({MAX_FILE_BYTES})."
            )

        file_path = self.workspace.resolve(path)
        before_sha256 = (
            hashlib.sha256(file_path.read_bytes()).hexdigest()
            if file_path.exists() and file_path.is_file()
            else None
        )
        file_path.parent.mkdir(parents=True, exist_ok=True)
        self._atomic_write(file_path, content)
        after_sha256 = hashlib.sha256(file_path.read_bytes()).hexdigest()

        return {
            "path": self.workspace.relative(file_path),
            "bytes": file_path.stat().st_size,
            "status": "written",
            "before_sha256": before_sha256,
            "sha256": after_sha256,
        }

    def patch_file(
        self,
        path: str,
        search: str,
        replace: str,
    ) -> dict[str, Any]:
        file_path = self.workspace.resolve(path)
        if not file_path.exists() or not file_path.is_file():
            raise ToolExecutionError(f"File not found: {path}")

        try:
            current = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ToolExecutionError(
                "Only UTF-8 text files are supported by patch_file."
            ) from exc

        occurrences = current.count(search)
        if occurrences == 0:
            raise ToolExecutionError("Patch search text was not found.")
        if occurrences > 1:
            raise ToolExecutionError(
                f"Patch is ambiguous: search text occurs {occurrences} times."
            )

        before_sha256 = hashlib.sha256(file_path.read_bytes()).hexdigest()
        updated = current.replace(search, replace, 1)
        if len(updated.encode("utf-8")) > MAX_FILE_BYTES:
            raise ToolExecutionError("Patched file exceeds maximum size.")

        self._atomic_write(file_path, updated)
        after_sha256 = hashlib.sha256(file_path.read_bytes()).hexdigest()
        return {
            "path": self.workspace.relative(file_path),
            "status": "patched",
            "replacements": 1,
            "before_sha256": before_sha256,
            "sha256": after_sha256,
        }

    async def execute_command_streaming(
        self,
        command: str,
        *,
        approved: bool = False,
        on_output: Callable[[str, str], Awaitable[None]] | None = None,
    ) -> dict[str, Any]:
        approval = self.policy.inspect(command)
        if approval and not approved:
            return {
                "status": "approval_required",
                "action": approval.action,
                "reason": approval.reason,
                "command": command,
            }

        argv = shlex.split(command, posix=os.name != "nt")
        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                cwd=self.workspace.root,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self._safe_env(),
            )
        except OSError as exc:
            return {"status": "error", "error": str(exc)}

        output: dict[str, list[str]] = {"stdout": [], "stderr": []}
        output_bytes = {"stdout": 0, "stderr": 0}

        async def read_stream(
            stream_name: str,
            stream: asyncio.StreamReader | None,
        ) -> None:
            if stream is None:
                return

            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    break

                text = chunk.decode("utf-8", errors="replace")
                if output_bytes[stream_name] < MAX_COMMAND_OUTPUT_BYTES:
                    remaining = MAX_COMMAND_OUTPUT_BYTES - output_bytes[stream_name]
                    encoded = text.encode("utf-8", errors="replace")
                    if len(encoded) > remaining:
                        text = encoded[:remaining].decode("utf-8", errors="ignore")
                    output[stream_name].append(text)
                    output_bytes[stream_name] += len(text.encode("utf-8", errors="replace"))

                if on_output is not None and text:
                    await on_output(stream_name, text)

        readers = [
            asyncio.create_task(read_stream("stdout", process.stdout)),
            asyncio.create_task(read_stream("stderr", process.stderr)),
        ]

        timed_out = False
        try:
            await asyncio.wait_for(process.wait(), timeout=COMMAND_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            timed_out = True
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        except asyncio.CancelledError:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
            raise
        finally:
            await asyncio.gather(*readers, return_exceptions=True)

        stdout = "".join(output["stdout"])
        stderr = "".join(output["stderr"])

        if timed_out:
            return {
                "status": "timeout",
                "timeout_seconds": COMMAND_TIMEOUT_SECONDS,
                "stdout": self._clip(stdout),
                "stderr": self._clip(stderr),
            }

        return {
            "status": "completed" if process.returncode == 0 else "failed",
            "exit_code": process.returncode,
            "stdout": self._clip(stdout),
            "stderr": self._clip(stderr),
        }

    def execute_command(
        self,
        command: str,
        approved: bool = False,
    ) -> dict[str, Any]:
        approval = self.policy.inspect(command)
        if approval and not approved:
            return {
                "status": "approval_required",
                "action": approval.action,
                "reason": approval.reason,
                "command": command,
            }

        argv = shlex.split(command, posix=os.name != "nt")
        try:
            completed = subprocess.run(
                argv,
                cwd=self.workspace.root,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=COMMAND_TIMEOUT_SECONDS,
                shell=False,
                env=self._safe_env(),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            return {
                "status": "timeout",
                "timeout_seconds": COMMAND_TIMEOUT_SECONDS,
                "stdout": self._clip(exc.stdout or ""),
                "stderr": self._clip(exc.stderr or ""),
            }
        except OSError as exc:
            return {"status": "error", "error": str(exc)}

        return {
            "status": "completed" if completed.returncode == 0 else "failed",
            "exit_code": completed.returncode,
            "stdout": self._clip(completed.stdout),
            "stderr": self._clip(completed.stderr),
        }

    @staticmethod
    def _atomic_write(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            delete=False,
        ) as temporary:
            temporary.write(content)
            temporary_name = temporary.name

        try:
            os.replace(temporary_name, path)
        except Exception:
            try:
                os.unlink(temporary_name)
            except OSError:
                pass
            raise

    @staticmethod
    def _safe_env() -> dict[str, str]:
        keep = {
            "PATH",
            "HOME",
            "USER",
            "LANG",
            "LC_ALL",
            "SystemRoot",
            "TEMP",
            "TMP",
            "TMPDIR",
            "PATHEXT",
        }
        return {key: value for key, value in os.environ.items() if key in keep}

    @staticmethod
    def _clip(value: str) -> str:
        encoded = value.encode("utf-8", errors="replace")
        if len(encoded) <= MAX_COMMAND_OUTPUT_BYTES:
            return value

        return (
            encoded[:MAX_COMMAND_OUTPUT_BYTES]
            .decode("utf-8", errors="ignore")
            + "\n…[output clipped]"
        )
