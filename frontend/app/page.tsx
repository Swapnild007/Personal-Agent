"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

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
  result?: { status?: string; stdout?: string; stderr?: string; error?: string };
  command?: string;
  arguments?: Record<string, unknown>;
  stream?: "stdout" | "stderr";
  chunk?: string;
  reason?: string;
  approval_id?: string;
};

const API = process.env.NEXT_PUBLIC_RADHA_API ?? "http://127.0.0.1:8000";

function flatten(node: TreeNode, prefix = ""): string[] {
  const path = prefix ? `${prefix}/${node.name}` : node.name;
  if (node.type === "file") return [path === "." ? "" : path];
  return (node.children ?? []).flatMap((child) =>
    flatten(child, node.name === "." ? "" : path),
  );
}

export default function Workspace() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selected, setSelected] = useState("");
  const [code, setCode] = useState("// Select a file from the explorer");
  const [prompt, setPrompt] = useState("");
  const [taskId, setTaskId] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<EventItem | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const terminalInstance = useRef<import("xterm").Terminal | null>(null);

  const files = useMemo(() => (tree ? flatten(tree) : []), [tree]);

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
        theme: { background: "#080c14", foreground: "#b9c6dc", cursor: "#6475ff" },
        scrollback: 3000,
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(terminalRef.current);
      fit.fit();
      terminal.writeln("\x1b[90mRADHA terminal ready. Command output will stream here.\x1b[0m");
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
      if (item.type === "tool_output" && terminalInstance.current) {
        const stream = item.stream === "stderr" ? "\x1b[31m" : "\x1b[37m";
        terminalInstance.current.write(stream + (item.chunk ?? "") + "\x1b[0m");
      }
      if (item.type === "tool_started" && item.tool === "execute_command") {
        const command = (item.arguments as { command?: string } | undefined)?.command ?? "";
        terminalInstance.current?.writeln("\r\n\x1b[36m$ " + command + "\x1b[0m");
      }
      if (item.type === "approval_required") setApproval(item);
      if (item.type === "task_completed" || item.type === "task_failed" || item.type === "task_cancelled") {
        setBusy(false);
        void loadTree();
      }
    };

    return () => socket.close();
  }, [taskId]);

  async function loadTree() {
    const response = await fetch(`${API}/workspace/tree`);
    if (!response.ok) return;
    setTree((await response.json()) as TreeNode);
  }

  async function openFile(path: string) {
    const response = await fetch(`${API}/workspace/file?path=${encodeURIComponent(path)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { content: string; path: string };
    setSelected(data.path);
    setCode(data.content);
  }

  async function runTask() {
    if (!prompt.trim() || busy) return;
    setEvents([]);
    terminalInstance.current?.clear();
    terminalInstance.current?.writeln("\x1b[90mStarting RADHA task…\x1b[0m");
    setApproval(null);
    setBusy(true);

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

  function renderNode(node: TreeNode, prefix = ""): React.ReactNode {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "file") {
      const filePath = path === "." ? "" : path;
      return (
        <button
          key={filePath}
          className={`tree-file ${selected === filePath ? "active" : ""}`}
          onClick={() => void openFile(filePath)}
        >
          <span>◈</span>{node.name}
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

  return (
    <main className="ide-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-orb">R</div>
          <div>
            <strong>RADHA</strong>
            <span>AUTONOMOUS ENGINEERING</span>
          </div>
        </div>
        <div className="status">
          <i className={connected ? "live" : ""} />
          {connected ? "STREAMING" : "READY"}
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="panel explorer">
          <div className="panel-head">
            <span>EXPLORER</span>
            <button onClick={() => void loadTree()}>↻</button>
          </div>
          <div className="tree">{tree ? renderNode(tree) : <span className="muted">Loading workspace…</span>}</div>
        </aside>

        <section className="panel editor-panel">
          <div className="editor-head">
            <span>{selected || "RADHA EDITOR"}</span>
            <span className="muted">{selected ? "READ VIEW" : "NO FILE SELECTED"}</span>
          </div>
          <div className="monaco-host">
          <Editor
            height="100%"
            theme="vs-dark"
            language={selected.endsWith(".py") ? "python" : selected.endsWith(".json") ? "json" : "plaintext"}
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

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the software task…"
            disabled={busy}
          />

          <div className="actions">
            <button className="run" onClick={() => void runTask()} disabled={busy || !prompt.trim()}>
              {busy ? "RUNNING…" : "RUN RADHA"}
            </button>
            <button className="cancel" onClick={() => void cancelTask()} disabled={!busy}>
              CANCEL
            </button>
          </div>

          <div className="trace">
            <div className="trace-head">
              <span>LIVE TRACE</span>
              <span>{events.length} events</span>
            </div>
            {events.length === 0 ? (
              <div className="empty-trace">RADHA activity will appear here.</div>
            ) : (
              events.slice(-40).map((item, index) => (
                <div className="trace-item" key={`${item.type}-${index}`}>
                  <span className="trace-dot" />
                  <div>
                    <strong>{item.type.replaceAll("_", " ")}</strong>
                    <small>
                      {item.tool ?? item.state ?? item.message ?? item.reason ?? item.result?.status ?? ""}
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
              <button className="approve" onClick={() => void resolveApproval(true)}>APPROVE</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
