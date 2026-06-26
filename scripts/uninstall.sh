#!/bin/bash
# Uninstaller for the Billing Timer macOS app.
#
#   ./scripts/uninstall.sh           remove the app (keep your logged data)
#   ./scripts/uninstall.sh --purge   also delete the data directory

set -euo pipefail

APP_NAME="Billing Timer"
APP_BUNDLE="$HOME/Applications/$APP_NAME.app"
DATA_DIR="$HOME/Library/Application Support/$APP_NAME"
LAUNCHAGENT="$HOME/Library/LaunchAgents/com.globalcrowley.billing-timer.plist"

PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

# Quit the app if it's open.
osascript -e "quit app \"$APP_NAME\"" 2>/dev/null || true
sleep 1

# Remove any leftover LaunchAgent from the old setup.
if [ -f "$LAUNCHAGENT" ]; then
  launchctl unload "$LAUNCHAGENT" 2>/dev/null || true
  rm -f "$LAUNCHAGENT"
fi

if [ -d "$APP_BUNDLE" ]; then
  rm -rf "$APP_BUNDLE"
  echo "Removed $APP_BUNDLE"
else
  echo "App not found at $APP_BUNDLE"
fi

if [ "$PURGE" -eq 1 ]; then
  rm -rf "$DATA_DIR"
  echo "Removed data directory $DATA_DIR"
else
  echo "Kept data directory $DATA_DIR (use --purge to remove it)"
fi
