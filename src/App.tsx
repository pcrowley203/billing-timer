import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function liveTotals(
  status: Status | null,
  running: boolean,
  startTime: string | null,
  liveElapsedMs: number
): { sessionHours: number; todayHours: number; totalHours: number } {
  const liveSessionHours = liveElapsedMs / 3_600_000;
  const serverSession = status?.currentSessionHours ?? 0;

  if (!running || !startTime) {
    return {
      sessionHours: status?.currentSessionHours ?? 0,
      todayHours: status?.todayHours ?? 0,
      totalHours: status?.totalHours ?? 0,
    };
  }

  const sessionStartedToday =
    localDateKey(startTime) === localDateKey(new Date().toISOString());
  const todayHours =
    (status?.todayHours ?? 0) +
    (sessionStartedToday ? liveSessionHours - serverSession : 0);
  const totalHours = (status?.totalHours ?? 0) - serverSession + liveSessionHours;

  return {
    sessionHours: liveSessionHours,
    todayHours,
    totalHours,
  };
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
  const [adjustMinutes, setAdjustMinutes] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const startRef = useRef<string | null>(null);
  const activeProjectRef = useRef<string | null>(null);
  const adjustDialogRef = useRef<HTMLDialogElement>(null);

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

  const openAdjust = useCallback(() => {
    setAdjustMinutes("");
    setAdjustNote("");
    setError("");
    adjustDialogRef.current?.showModal();
  }, []);

  const submitAdjust = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const raw = adjustMinutes.trim();
      const minutes = raw === "" ? 0 : Number(raw);
      if (!Number.isInteger(minutes)) {
        setError("Minutes must be an integer.");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/adjust", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: selectedProject,
            minutes,
            note: adjustNote.trim(),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to adjust.");
          return;
        }
        adjustDialogRef.current?.close();
        await refresh(selectedProject || undefined);
      } catch {
        setError("Could not reach the server. Is it running?");
      } finally {
        setBusy(false);
      }
    },
    [adjustMinutes, adjustNote, refresh, selectedProject]
  );

  const running = status?.running ?? false;
  const displayProject = running ? activeProjectRef.current : selectedProject;

  let liveElapsedMs = 0;
  if (running && startRef.current) {
    liveElapsedMs = Date.now() - new Date(startRef.current).getTime();
  }
  void tick;

  const totals = liveTotals(status, running, startRef.current, liveElapsedMs);

  const canStart = !busy && !running && selectedProject !== "";
  const canAdjust = canStart;

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
          <button
            className="adjust"
            onClick={openAdjust}
            disabled={!canAdjust}
          >
            Adjust
          </button>
        </div>

        <dialog ref={adjustDialogRef} className="adjustDialog">
          <form onSubmit={submitAdjust}>
            <h2>Adjust</h2>
            <label className="fieldLabel" htmlFor="adjust-minutes">
              Minutes
            </label>
            <input
              id="adjust-minutes"
              type="number"
              step="1"
              value={adjustMinutes}
              onChange={(e) => setAdjustMinutes(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <label className="fieldLabel" htmlFor="adjust-note">
              Annotation
            </label>
            <input
              id="adjust-note"
              type="text"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              disabled={busy}
            />
            <div className="dialogButtons">
              <button
                type="button"
                className="dialogCancel"
                onClick={() => adjustDialogRef.current?.close()}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="adjust" disabled={busy}>
                OK
              </button>
            </div>
          </form>
        </dialog>

        {displayProject && (
          <div className="totals">
            <div className="stat">
              <div className="label">This session</div>
              <div className="value">{totals.sessionHours.toFixed(2)}h</div>
            </div>
            <div className="stat">
              <div className="label">Today ({displayProject})</div>
              <div className="value">{totals.todayHours.toFixed(2)}h</div>
            </div>
            <div className="stat">
              <div className="label">All time ({displayProject})</div>
              <div className="value">{totals.totalHours.toFixed(2)}h</div>
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
