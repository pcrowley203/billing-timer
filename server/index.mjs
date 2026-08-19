import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// Data lives in a standard per-user location by default:
//   - BILLING_TIMER_DATA_DIR, if set (the macOS app passes this)
//   - ~/Library/Application Support/Billing Timer on macOS
//   - ./data elsewhere (e.g. plain `npm run dev`)
function defaultDataDir() {
  if (process.env.BILLING_TIMER_DATA_DIR) {
    return process.env.BILLING_TIMER_DATA_DIR;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Billing Timer");
  }
  return path.join(ROOT, "data");
}

const DATA_DIR = defaultDataDir();
const LOG_NAME = process.env.LOG_FILE || "timesheet.log";
const LOG_FILE = path.join(DATA_DIR, LOG_NAME);
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Projects ------------------------------------------------------------
// projects.json: ["Acme Corp", "Beta LLC", ...]

function loadProjects() {
  try {
    const raw = fs.readFileSync(PROJECTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string" && p.trim()) : [];
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

let projects = loadProjects();

// --- State ---------------------------------------------------------------
// state.json:
//   { running, startTime, activeProject, sessions: [{start, end, hours, project}] }

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      running: Boolean(parsed.running),
      startTime: parsed.startTime ?? null,
      activeProject: parsed.activeProject ?? null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { running: false, startTime: null, activeProject: null, sessions: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

// --- Helpers -------------------------------------------------------------
const MS_PER_HOUR = 1000 * 60 * 60;

function hoursBetween(startISO, endISO) {
  return (new Date(endISO).getTime() - new Date(startISO).getTime()) / MS_PER_HOUR;
}

function localDateKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTimestamp(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sessionProject(s) {
  return s.project || "Unknown";
}

function isAdjust(s) {
  return s.kind === "adjust";
}

function eventTime(s) {
  return isAdjust(s) ? s.at : s.start;
}

function fmtSignedInt(n) {
  return n > 0 ? `+${n}` : String(n);
}

function completedHoursForProject(project) {
  return state.sessions
    .filter((s) => sessionProject(s) === project)
    .reduce((sum, s) => sum + s.hours, 0);
}

function completedHoursForProjectDay(project, dayKey) {
  return state.sessions
    .filter((s) => sessionProject(s) === project && localDateKey(eventTime(s)) === dayKey)
    .reduce((sum, s) => sum + s.hours, 0);
}

function computeTotals(project, nowISO) {
  if (!project) {
    return { currentSessionHours: 0, todayHours: 0, totalHours: 0 };
  }

  const todayKey = localDateKey(nowISO);
  let currentSessionHours = 0;
  const live =
    state.running &&
    state.startTime &&
    state.activeProject === project;

  if (live) {
    currentSessionHours = hoursBetween(state.startTime, nowISO);
  }

  const liveCountsToday =
    live && localDateKey(state.startTime) === todayKey;

  return {
    currentSessionHours: round2(currentSessionHours),
    todayHours: round2(
      completedHoursForProjectDay(project, todayKey) +
        (liveCountsToday ? currentSessionHours : 0)
    ),
    totalHours: round2(
      completedHoursForProject(project) + (live ? currentSessionHours : 0)
    ),
  };
}

// --- Log file rendering --------------------------------------------------
function renderLogFile() {
  const lines = [];
  lines.push("# Billing Timer log");
  lines.push("# Each STOP records: session hours, day total, and all-time total (per project).");
  lines.push("# Each ADJUST records: minutes, day total, and all-time total (per project).");
  lines.push("");

  const projectDayTotals = {};
  const projectTotals = {};

  for (const s of state.sessions) {
    const project = sessionProject(s);
    const dayKey = localDateKey(eventTime(s));

    if (!projectDayTotals[project]) projectDayTotals[project] = {};
    projectDayTotals[project][dayKey] =
      (projectDayTotals[project][dayKey] || 0) + s.hours;
    projectTotals[project] = (projectTotals[project] || 0) + s.hours;

    const dayTotal = projectDayTotals[project][dayKey];
    const total = projectTotals[project];

    if (isAdjust(s)) {
      let line =
        `${fmtTimestamp(s.at)}  ADJUST  ` +
        `project=${project}  ` +
        `minutes=${fmtSignedInt(s.minutes)}  ` +
        `day=${round2(dayTotal).toFixed(2)}h  ` +
        `total=${round2(total).toFixed(2)}h`;
      if (s.note) line += `  note=${s.note}`;
      lines.push(line);
      continue;
    }

    lines.push(`${fmtTimestamp(s.start)}  START  project=${project}`);
    lines.push(
      `${fmtTimestamp(s.end)}  STOP   ` +
        `project=${project}  ` +
        `session=${round2(s.hours).toFixed(2)}h  ` +
        `day=${round2(dayTotal).toFixed(2)}h  ` +
        `total=${round2(total).toFixed(2)}h`
    );
  }

  if (state.running && state.startTime && state.activeProject) {
    lines.push(
      `${fmtTimestamp(state.startTime)}  START  project=${state.activeProject}`
    );
    lines.push(`(running…)`);
  }

  lines.push("");
  return lines.join("\n");
}

function writeLogFile() {
  fs.writeFileSync(LOG_FILE, renderLogFile());
}

writeLogFile();

// --- API -----------------------------------------------------------------
const app = express();
app.use(express.json());

app.get("/api/projects", (_req, res) => {
  res.json({ projects });
});

app.post("/api/projects", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ error: "Project name is required." });
  }
  if (projects.includes(name)) {
    return res.status(409).json({ error: "That project already exists." });
  }
  projects.push(name);
  projects.sort((a, b) => a.localeCompare(b));
  saveProjects(projects);
  res.json({ ok: true, projects });
});

app.get("/api/status", (req, res) => {
  const now = new Date().toISOString();
  const project =
    state.running && state.activeProject
      ? state.activeProject
      : typeof req.query.project === "string"
        ? req.query.project
        : null;

  res.json({
    running: state.running,
    startTime: state.startTime,
    activeProject: state.activeProject,
    now,
    logFile: LOG_NAME,
    project,
    ...computeTotals(project, now),
  });
});

app.post("/api/start", (req, res) => {
  if (state.running) {
    return res.status(409).json({ error: "Timer is already running." });
  }

  const project = typeof req.body?.project === "string" ? req.body.project.trim() : "";
  if (!project) {
    return res.status(400).json({ error: "Select a project before starting." });
  }
  if (!projects.includes(project)) {
    return res.status(400).json({ error: "Unknown project." });
  }

  state.running = true;
  state.startTime = new Date().toISOString();
  state.activeProject = project;
  saveState(state);
  writeLogFile();

  const now = new Date().toISOString();
  res.json({
    ok: true,
    running: true,
    startTime: state.startTime,
    activeProject: state.activeProject,
    project,
    ...computeTotals(project, now),
  });
});

app.post("/api/adjust", (req, res) => {
  if (state.running) {
    return res.status(409).json({ error: "Stop the timer before adding a manual adjustment." });
  }

  const project = typeof req.body?.project === "string" ? req.body.project.trim() : "";
  if (!project) {
    return res.status(400).json({ error: "Select a project before adjusting." });
  }
  if (!projects.includes(project)) {
    return res.status(400).json({ error: "Unknown project." });
  }

  const minutes = req.body?.minutes === undefined || req.body?.minutes === null || req.body?.minutes === ""
    ? 0
    : Number(req.body.minutes);
  if (!Number.isInteger(minutes)) {
    return res.status(400).json({ error: "Minutes must be an integer." });
  }

  const note =
    typeof req.body?.note === "string" ? req.body.note.replace(/\s+/g, " ").trim() : "";

  const at = new Date().toISOString();
  state.sessions.push({
    kind: "adjust",
    at,
    minutes,
    hours: minutes / 60,
    project,
    note,
  });
  saveState(state);
  writeLogFile();

  res.json({
    ok: true,
    project,
    ...computeTotals(project, at),
  });
});

app.post("/api/stop", (_req, res) => {
  if (!state.running || !state.startTime || !state.activeProject) {
    return res.status(409).json({ error: "Timer is not running." });
  }

  const end = new Date().toISOString();
  const start = state.startTime;
  const project = state.activeProject;
  const hours = round2(hoursBetween(start, end));

  state.sessions.push({ start, end, hours, project });
  state.running = false;
  state.startTime = null;
  state.activeProject = null;
  saveState(state);
  writeLogFile();

  res.json({
    ok: true,
    running: false,
    activeProject: null,
    project,
    ...computeTotals(project, end),
  });
});

app.get("/api/log", (_req, res) => {
  let contents = "";
  try {
    contents = fs.readFileSync(LOG_FILE, "utf8");
  } catch {
    contents = "";
  }
  res.type("text/plain").send(contents);
});

// --- Serve built frontend in production ----------------------------------
const DIST = path.join(ROOT, "dist");
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Billing Timer server running at http://localhost:${PORT}`);
  console.log(`Logging to ${LOG_FILE}`);
});
