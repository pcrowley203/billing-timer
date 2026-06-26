#!/bin/bash
# Installs (or reinstalls) the Billing Timer LaunchAgent so the server starts
# automatically at login. Safe to run multiple times.

set -euo pipefail

LABEL="com.globalcrowley.billing-timer"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Locate node so the LaunchAgent (which has a minimal PATH) can find it.
if command -v node >/dev/null 2>&1; then
  NODE_BIN_DIR="$(cd "$(dirname "$(command -v node)")" && pwd)"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  NODE_BIN_DIR="$(cd "$(dirname "$(command -v node)")" && pwd)"
else
  echo "Error: could not find node. Install Node (or nvm) and try again." >&2
  exit 1
fi

echo "Project:  $PROJECT_DIR"
echo "Node bin: $NODE_BIN_DIR"
echo "Plist:    $PLIST"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$PROJECT_DIR/data"
chmod +x "$SCRIPT_DIR/start-server.sh"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT_DIR/start-server.sh</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>

    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/data/server.log</string>

    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/data/server.err.log</string>
</dict>
</plist>
PLIST_EOF

# Reload if already loaded, then load.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo
echo "Installed and started. The server will run at login."
echo "Open http://localhost:3001"
