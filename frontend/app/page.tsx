"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";

type TreeNode = {
  name: string;
  type: "file" | "directory";
  children?: TreeNode[];
};

type EventItem = {
  type: string;
  task_id?: string;
  state?: string;
  tool?: string;
  message?: string;
  result?: {
    status?: string;
    stdout?: string;
    stderr?: string;
    error?: string;
    path?: string;
  };
  command?: string;
  arguments?: Record<string, unknown>;
  stream?: "stdout" | "stderr";
  chunk?: string;
  reason?: string;
  approval_id?: string;
  path?: string;
  action?: string;
  timestamp?: number;
  round?: number;
};

const API = process.env.NEXT_PUBLIC_RADHA_API ?? "http://127.0.0.1:8000";

const STATE_LABELS: Record<string, string> = {
  queued: "QUEUED",
  planning: "PLANNING",
  executing: "EXECUTING",
  waiting_for_approval: "APPROVAL",
  verifying: "VERIFYING",
  completed: "COMPLETED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

function flatten(node: TreeNode, prefix = ""): string[] {
  const path = prefix ? `${prefix}/${node.name}` : node.name;
  if (node.type === "file") return [path === "." ? "" : path];
  return (node.children ?? []).flatMap((child) =>
    flatten(child, node.name === "." ? "" : path),
  );
}

function languageFor(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".html")) return "html";
  return "plaintext";
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return "--:--:--";
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour12: false,
  });
}

export default function Workspace() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selected, setSelected] = useState("");
  const [code, setCode] = useState("// Select a file from the explorer");
  const [originalCode, setOriginalCode] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [taskId, setTaskId] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<EventItem | null>(null);
  const [currentState, setCurrentState] = useState("ready");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const terminalInstance = useRef<import("xterm").Terminal | null>(null);
  const selectedRef = useRef("");
  const taskStartedRef = useRef<number | null>(null);

  const files = useMemo(() => (tree ? flatten(tree) : []), [tree]);

  const changedFiles = useMemo(() => {
    const seen = new Map<string, EventItem>();
    for (const item of events) {
      if (item.type === "file_changed" && item.path) seen.set(item.path, item);
    }
    return [...seen.values()];
  }, [events]);

  const stateEvents = useMemo(
    () => events.filter((item) => item.type === "state_changed"),
    [events],
  );

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    void loadTree();
  }, []);

  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) return;

    let disposed = false;
    let terminal: import("xterm").Terminal | null = null;
    let cleanupResize: (() => void) | undefined;

    async function mountTerminal() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("xterm-addon-fit"),
      ]);
      if (disposed || !terminalRef.current) return;

      terminal = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        theme: {
          background: "#080c14",
          foreground: "#b9c6dc",
          cursor: "#6475ff",
        },
        scrollback: 3000,
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(terminalRef.current);
      fit.fit();
      terminal.writeln(
        "\x1b[90mRADHA terminal ready. Command output will stream here.\x1b[0m",
      );
      terminalInstance.current = terminal;

      const resize = () => fit.fit();
      window.addEventListener("resize", resize);
      cleanupResize = () => window.removeEventListener("resize", resize);
    }

    void mountTerminal();

    return () => {
      disposed = true;
      cleanupResize?.();
      terminal?.dispose();
      terminalInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!taskId) return;

    const wsUrl = API.replace(/^http/, "ws") + `/ws/tasks/${taskId}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);

    socket.onmessage = (event) => {
      const item = JSON.parse(event.data) as EventItem;
      setEvents((current) => [...current, item]);

      if (item.type === "state_changed" && item.state) {
        setCurrentState(item.state);
        if (!taskStartedRef.current) {
          taskStartedRef.current = item.timestamp ?? Date.now() / 1000;
          setStartedAt(taskStartedRef.current);
        }
      }

      if (item.type === "tool_output" && terminalInstance.current) {
        const stream = item.stream === "stderr" ? "\x1b[31m" : "\x1b[37m";
        terminalInstance.current.write(
          stream + (item.chunk ?? "") + "\x1b[0m",
        );
      }

      if (item.type === "tool_started" && item.tool === "execute_command") {
        const command =
          (item.arguments as { command?: string } | undefined)?.command ?? "";
        terminalInstance.current?.writeln(
          "\r\n\x1b[36m$ " + command + "\x1b[0m",
        );
      }

      if (item.type === "file_changed") {
        const path = item.path ?? "";
        if (path && selectedRef.current === path) {
          void refreshCurrentFile(path);
        }
        void loadTree();
      }

      if (item.type === "approval_required") setApproval(item);

      if (
        item.type === "task_completed" ||
        item.type === "task_failed" ||
        item.type === "task_cancelled"
      ) {
        setBusy(false);
        void loadTree();
        if (selectedRef.current) {
          void refreshCurrentFile(selectedRef.current);
        }
      }
    };

    return () => socket.close();
  }, [taskId]);

  async function loadTree() {
    try {
      const response = await fetch(`${API}/workspace/tree`);
      if (!response.ok) return;
      setTree((await response.json()) as TreeNode);
    } catch {
      // Keep the IDE usable while the backend is offline.
    }
  }

  async function refreshCurrentFile(path: string) {
    try {
      const response = await fetch(
        `${API}/workspace/file?path=${encodeURIComponent(path)}`,
      );
      if (!response.ok) return;
      const data = (await response.json()) as { content: string; path: string };
      setCode(data.content);
    } catch {
      // Backend may be restarting.
    }
  }

  async function openFile(path: string) {
    const response = await fetch(
      `${API}/workspace/file?path=${encodeURIComponent(path)}`,
    );
    if (!response.ok) return;
    const data = (await response.json()) as { content: string; path: string };
    setSelected(data.path);
    setCode(data.content);
    setOriginalCode(data.content);
    setShowDiff(false);
  }

  async function runTask() {
    if (!prompt.trim() || busy) return;

    setEvents([]);
    setCurrentState("queued");
    taskStartedRef.current = null;
    setStartedAt(null);
    terminalInstance.current?.clear();
    terminalInstance.current?.writeln(
      "\x1b[90mStarting RADHA task…\x1b[0m",
    );
    setApproval(null);
    setBusy(true);

    try {
      const response = await fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: prompt.trim() }),
      });

      if (!response.ok) {
        setBusy(false);
        return;
      }

      const data = (await response.json()) as { task_id: string };
      setTaskId(data.task_id);
    } catch {
      setBusy(false);
      setCurrentState("offline");
    }
  }

  async function cancelTask() {
    if (!taskId) return;
    await fetch(`${API}/tasks/${taskId}/cancel`, { method: "POST" });
  }

  async function resolveApproval(approved: boolean) {
    if (!approval?.approval_id || !taskId) return;
    await fetch(
      `${API}/tasks/${taskId}/approvals/${approval.approval_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      },
    );
    setApproval(null);
  }

  function renderNode(node: TreeNode, prefix = ""): ReactNode {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "file") {
      const filePath = path === "." ? "" : path;
      return (
        <button
          key={filePath}
          className={`tree-file ${selected === filePath ? "active" : ""}`}
          onClick={() => void openFile(filePath)}
        >
          <span>◈</span>
          {node.name}
        </button>
      );
    }

    return (
      <div key={path} className="tree-folder">
        <div className="tree-folder-title">▾ {node.name}</div>
        <div className="tree-children">
          {(node.children ?? []).map((child) =>
            renderNode(child, node.name === "." ? "" : path),
          )}
        </div>
      </div>
    );
  }

  const stateLabel = STATE_LABELS[currentState] ?? currentState.toUpperCase();
  const lastState = stateEvents.at(-1);
  const elapsed =
    startedAt && busy
      ? Math.max(0, Math.floor(Date.now() / 1000 - startedAt))
      : null;

  return (
    <main className="ide-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-orb">R</div>
          <div>
            <strong>RADHA</strong>
            <span>ROBUST AUTOMATED DEVELOPER & HEURISTIC ARCHITECT</span>
          </div>
        </div>
        <div className="top-status">
          <div className={`status-pill ${connected ? "live" : ""}`}>
            <i />
            {connected ? "STREAMING" : stateLabel}
          </div>
          {elapsed !== null && <span className="elapsed">{elapsed}s</span>}
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="panel explorer">
          <div className="panel-head">
            <span>EXPLORER</span>
            <button onClick={() => void loadTree()}>↻</button>
          </div>
          <div className="tree">
            {tree ? (
              renderNode(tree)
            ) : (
              <span className="muted">Loading workspace…</span>
            )}
          </div>
        </aside>

        <section className="panel editor-panel">
          <div className="editor-head">
            <span>{selected || "RADHA EDITOR"}</span>
            <div className="editor-controls">
              {selected && (
                <button onClick={() => setShowDiff((value) => !value)}>
                  {showDiff ? "CODE" : "DIFF"}
                </button>
              )}
              <span className="muted">
                {selected
                  ? showDiff
                    ? "CHANGE VIEW"
                    : "READ VIEW"
                  : "NO FILE SELECTED"}
              </span>
            </div>
          </div>

          <div className="monaco-host">
            {showDiff ? (
              <DiffEditor
                height="100%"
                theme="vs-dark"
                original={originalCode}
                modified={code}
                language={languageFor(selected)}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  automaticLayout: true,
                  renderSideBySide: true,
                  readOnly: true,
                  padding: { top: 18 },
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <Editor
                height="100%"
                theme="vs-dark"
                language={languageFor(selected)}
                value={code}
                onChange={(value) => setCode(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  automaticLayout: true,
                  padding: { top: 18 },
                  scrollBeyondLastLine: false,
                }}
              />
            )}
          </div>

          <section className="terminal-panel">
            <div className="terminal-head">
              <span>TERMINAL STREAM</span>
              <span className="muted">LIVE STDOUT / STDERR</span>
            </div>
            <div ref={terminalRef} className="terminal-host" />
          </section>
        </section>

        <aside className="panel intelligence">
          <div className="intel-title">
            <div>
              <span>RADHA CORE</span>
              <strong>INTELLIGENCE HUB</strong>
            </div>
            <div className="pulse" />
          </div>

          <div className="task-state">
            <div>
              <span>MISSION STATE</span>
              <strong>{stateLabel}</strong>
            </div>
            <div className="state-round">
              {lastState?.round ? `R${lastState.round}` : "IDLE"}
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the software task…\n\nExample: inspect the project, fix the failing tests, then verify the build."
            disabled={busy}
          />

          <div className="actions">
            <button
              className="run"
              onClick={() => void runTask()}
              disabled={busy || !prompt.trim()}
            >
              {busy ? "RADHA IS WORKING…" : "RUN RADHA"}
            </button>
            <button
              className="cancel"
              onClick={() => void cancelTask()}
              disabled={!busy}
            >
              CANCEL
            </button>
          </div>

          <div className="change-intel">
            <div className="section-head">
              <span>CHANGE INTELLIGENCE</span>
              <span>{changedFiles.length}</span>
            </div>
            {changedFiles.length === 0 ? (
              <div className="section-empty">No files changed in this task.</div>
            ) : (
              changedFiles.map((item) => (
                <button
                  className="changed-file"
                  key={item.path}
                  onClick={() => item.path && void openFile(item.path)}
                >
                  <span className="file-action">{item.action === "patched" ? "Δ" : "+"}</span>
                  <span>{item.path}</span>
                  <small>{item.action}</small>
                </button>
              ))
            )}
          </div>

          <div className="timeline">
            <div className="section-head">
              <span>TASK TIMELINE</span>
              <span>{stateEvents.length}</span>
            </div>
            {stateEvents.length === 0 ? (
              <div className="section-empty">
                Planning, execution and verification will appear here.
              </div>
            ) : (
              stateEvents.map((item, index) => (
                <div className="timeline-item" key={`${item.timestamp}-${index}`}>
                  <div className="timeline-rail">
                    <span className={item.state === currentState ? "active" : ""} />
                  </div>
                  <div className="timeline-copy">
                    <strong>{STATE_LABELS[item.state ?? ""] ?? item.state}</strong>
                    <small>
                      {formatTime(item.timestamp)}
                      {item.round ? ` · round ${item.round}` : ""}
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="trace">
            <div className="trace-head">
              <span>LIVE TOOL TRACE</span>
              <span>{events.length} events</span>
            </div>
            {events.length === 0 ? (
              <div className="empty-trace">RADHA activity will appear here.</div>
            ) : (
              events
                .filter((item) => item.type !== "tool_output")
                .slice(-50)
                .map((item, index) => (
                  <div className="trace-item" key={`${item.type}-${index}`}>
                    <span className="trace-dot" />
                    <div>
                      <strong>{item.type.replaceAll("_", " ")}</strong>
                      <small>
                        {item.tool ??
                          item.state ??
                          item.path ??
                          item.message ??
                          item.reason ??
                          item.result?.status ??
                          ""}
                      </small>
                    </div>
                  </div>
                ))
            )}
          </div>
        </aside>
      </section>

      {approval && (
        <div className="approval-backdrop">
          <div className="approval-card">
            <span className="warning">APPROVAL REQUIRED</span>
            <h2>RADHA wants to change repository state.</h2>
            <p>{approval.reason}</p>
            <code>{approval.command}</code>
            <div className="approval-actions">
              <button onClick={() => void resolveApproval(false)}>DENY</button>
              <button
                className="approve"
                onClick={() => void resolveApproval(true)}
              >
                APPROVE
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
