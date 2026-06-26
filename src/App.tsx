import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

type Status = {
  running: boolean;
  startTime: string | null;
  activeProject: string | null;
  now: string;
  logFile: string;
  project: string | null;
  currentSessionHours: number;
  todayHours: number;
  totalHours: number;
};

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [newProject, setNewProject] = useState("");
  const [log, setLog] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const startRef = useRef<string | null>(null);
  const activeProjectRef = useRef<string | null>(null);

  const refresh = useCallback(async (project?: string) => {
    try {
      const projectParam = project ? `?project=${encodeURIComponent(project)}` : "";
      const [s, l, p] = await Promise.all([
        fetch(`/api/status${projectParam}`).then((r) => r.json()),
        fetch("/api/log").then((r) => r.text()),
        fetch("/api/projects").then((r) => r.json()),
      ]);
      setStatus(s);
      setLog(l);
      setProjects(p.projects ?? []);
      startRef.current = s.running ? s.startTime : null;
      activeProjectRef.current = s.running ? s.activeProject : null;
      if (s.running && s.activeProject) {
        setSelectedProject(s.activeProject);
      }
      setError("");
    } catch {
      setError("Could not reach the server. Is it running?");
    }
  }, []);

  useEffect(() => {
    refresh(selectedProject || undefined);
  }, [refresh, selectedProject]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const addProject = useCallback(async () => {
    const name = newProject.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to add project.");
        return;
      }
      const body = await res.json();
      setProjects(body.projects ?? []);
      setSelectedProject(name);
      setNewProject("");
      setError("");
    } catch {
      setError("Could not reach the server. Is it running?");
    } finally {
      setBusy(false);
    }
  }, [newProject]);

  const action = useCallback(
    async (kind: "start" | "stop") => {
      setBusy(true);
      try {
        const options: RequestInit = { method: "POST" };
        if (kind === "start") {
          options.headers = { "Content-Type": "application/json" };
          options.body = JSON.stringify({ project: selectedProject });
        }
        const res = await fetch(`/api/${kind}`, options);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `Failed to ${kind}.`);
        }
        await refresh(selectedProject || undefined);
      } catch {
        setError("Could not reach the server. Is it running?");
      } finally {
        setBusy(false);
      }
    },
    [refresh, selectedProject]
  );

  const running = status?.running ?? false;
  const displayProject = running ? activeProjectRef.current : selectedProject;

  let liveElapsedMs = 0;
  if (running && startRef.current) {
    liveElapsedMs = Date.now() - new Date(startRef.current).getTime();
  }
  void tick;

  const canStart = !busy && !running && selectedProject !== "";

  return (
    <div className="app">
      <div className="header">
        <h1>Billing Timer</h1>
        {status && <span className="logname">{status.logFile}</span>}
      </div>

      <div className="card">
        <div className="projectSection">
          <label className="fieldLabel" htmlFor="project-select">
            Project
          </label>
          <div className="projectRow">
            <select
              id="project-select"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              disabled={busy || running}
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {!running && (
            <div className="addProjectRow">
              <input
                type="text"
                placeholder="New project name"
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addProject()}
                disabled={busy}
              />
              <button
                className="addProject"
                onClick={addProject}
                disabled={busy || !newProject.trim()}
              >
                Add
              </button>
            </div>
          )}
        </div>

        <div className="statusRow">
          <span className={`dot ${running ? "running" : ""}`} />
          <span className="statusText">
            {running ? "Running" : "Stopped"}
            {running && activeProjectRef.current
              ? ` · ${activeProjectRef.current}`
              : ""}
            {running && startRef.current
              ? ` · started ${new Date(startRef.current).toLocaleTimeString()}`
              : ""}
          </span>
        </div>

        <div className="elapsed">
          {running ? formatElapsed(liveElapsedMs) : "00:00:00"}
        </div>

        <div className="buttons">
          <button
            className="start"
            onClick={() => action("start")}
            disabled={!canStart}
          >
            Start
          </button>
          <button
            className="stop"
            onClick={() => action("stop")}
            disabled={busy || !running}
          >
            Stop
          </button>
        </div>

        {displayProject && (
          <div className="totals">
            <div className="stat">
              <div className="label">This session</div>
              <div className="value">
                {(running
                  ? liveElapsedMs / 3_600_000
                  : status?.currentSessionHours ?? 0
                ).toFixed(2)}
                h
              </div>
            </div>
            <div className="stat">
              <div className="label">Today ({displayProject})</div>
              <div className="value">{(status?.todayHours ?? 0).toFixed(2)}h</div>
            </div>
            <div className="stat">
              <div className="label">All time ({displayProject})</div>
              <div className="value">{(status?.totalHours ?? 0).toFixed(2)}h</div>
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>

      <div className="logSection">
        <h2>Log file</h2>
        <pre className="log">{log || "(empty)"}</pre>
      </div>
    </div>
  );
}
