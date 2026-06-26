#!/bin/bash
# Stops the Billing Timer LaunchAgent and removes it so it no longer starts
# at login. Safe to run even if it isn't currently installed.

set -euo pipefail

LABEL="com.globalcrowley.billing-timer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled. The server will no longer start at login."
else
  echo "Nothing to do: $PLIST not found."
fi
