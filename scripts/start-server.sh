#!/bin/bash
# Wrapper used by the LaunchAgent to run the Billing Timer server.
# LaunchAgents start with a minimal environment, so we make sure node is on
# PATH and run from the project directory. Paths are derived dynamically so
# this works on any machine.

set -euo pipefail

# Project dir is the parent of this script's directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Try to make node available. The installer bakes the node bin dir into the
# LaunchAgent's PATH, but we also source nvm as a fallback for manual runs.
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
  fi
fi

cd "$PROJECT_DIR"

# Build the UI if it hasn't been built yet, so the server has something to serve.
if [ ! -f "$PROJECT_DIR/dist/index.html" ]; then
  npm run build
fi

exec node server/index.mjs
