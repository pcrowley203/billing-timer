# Billing Timer

A small app to track freelance consulting hours across multiple projects.
Register projects, pick one from the dropdown, then press **Start** to begin a
session and **Stop** to end it. Each stop records the end time, the elapsed
hours for that session, the running total for the day (for that project), and
the all-time total (for that project).
Everything is written to a plain-text log file you can read or hand to a client.

## Stack

- **Frontend:** Vite + React + TypeScript
- **Backend:** Express (reads/writes the log file)

## Setup

```sh
npm install
```

## Run (development)

Runs the API server and the Vite dev server together:

```sh
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

## Run (single server)

Build the UI and serve everything from Express on one port:

```sh
npm run serve
```

Then open http://localhost:3001.

## Run automatically at login (macOS)

A LaunchAgent can run the server in the background and start it whenever you
log in (and restart it if it crashes).

Install it:

```sh
./scripts/install-launchagent.sh
```

This detects your Node path and project location, writes
`~/Library/LaunchAgents/com.globalcrowley.billing-timer.plist`, and starts the
server at http://localhost:3001. It's safe to re-run (it reinstalls).

Uninstall it:

```sh
./scripts/uninstall-launchagent.sh
```

Other useful commands:

```sh
# Restart after changing code (rebuild first if you changed the UI)
npm run build
launchctl kickstart -k gui/$(id -u)/com.globalcrowley.billing-timer
```

Server output is logged to `data/server.log` and `data/server.err.log`.

## Where the data lives

- Human-readable log: `data/timesheet.log`
- Source-of-truth state: `data/state.json`
- Registered projects: `data/projects.json`

The `data/` directory is git-ignored so your hours stay private.

### Changing the log file name

Set the `LOG_FILE` environment variable:

```sh
LOG_FILE=acme-corp.log npm run dev
```

## Log format

```
2026-06-26 09:00:00  START  project=Acme Corp
2026-06-26 10:30:00  STOP   project=Acme Corp  session=1.50h  day=1.50h  total=1.50h
```

Day and total hours are tracked separately for each project.
