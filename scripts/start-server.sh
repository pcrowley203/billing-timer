#!/bin/bash
# Wrapper used by the LaunchAgent to run the Billing Timer server.
# LaunchAgents start with a minimal environment, so we put the nvm-managed
# node on PATH and run from the project directory.

set -euo pipefail

NODE_BIN="/Users/paulcrowley/.nvm/versions/node/v20.19.5/bin"
PROJECT_DIR="/Users/paulcrowley/repositories/billing-timer"

export PATH="$NODE_BIN:$PATH"
cd "$PROJECT_DIR"

# Build the UI if it hasn't been built yet, so the server has something to serve.
if [ ! -f "$PROJECT_DIR/dist/index.html" ]; then
  npm run build
fi

exec node server/index.mjs
