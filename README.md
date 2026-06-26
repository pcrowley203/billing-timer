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

## Install as a macOS app

Install a self-contained `Billing Timer.app` into `~/Applications`:

```sh
./scripts/install.sh
```

The installer builds the UI, bundles the server and its production
dependencies inside the app, compiles a small native wrapper window, applies a
custom stopwatch icon, and migrates any existing `data/` into the standard data
directory. Open it from Finder/Spotlight or pin it to the Dock.

The app is self-managing:

- It **starts the backend automatically** when you open it.
- It **stops the backend automatically** when you quit it.
- If something is already serving port 3001, it just connects to that.

It does require Node to be installed (the installer records the Node path to
use). Re-run `./scripts/install.sh` any time you change the code.

Uninstall it:

```sh
./scripts/uninstall.sh           # remove the app, keep your data
./scripts/uninstall.sh --purge   # also delete the data directory
```

### Icon

The icon master is `macos/icon.png`. To regenerate it from the source art
(`macos/icon-source.png`) — e.g. after replacing the artwork — run:

```sh
python3 scripts/make-icon.py
```

## Where the data lives

On macOS, data is stored in the standard per-user location (used by both the
installed app and plain `npm run serve`):

```
~/Library/Application Support/Billing Timer/
```

- Human-readable log: `timesheet.log`
- Source-of-truth state: `state.json`
- Registered projects: `projects.json`

On other platforms (or when overridden), it falls back to a local `data/`
directory in the project, which is git-ignored.

### Overriding the data location

Set `BILLING_TIMER_DATA_DIR` to choose where data is stored, or `LOG_FILE` to
change just the log file name:

```sh
BILLING_TIMER_DATA_DIR=~/Desktop/timer-data LOG_FILE=acme-corp.log npm run serve
```

## Log format

```
2026-06-26 09:00:00  START  project=Acme Corp
2026-06-26 10:30:00  STOP   project=Acme Corp  session=1.50h  day=1.50h  total=1.50h
```

Day and total hours are tracked separately for each project.
