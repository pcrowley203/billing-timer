#!/bin/bash
# Full installer for the Billing Timer macOS app.
#
# Builds a self-contained app bundle that carries its own copy of the server,
# the built UI, and its production node_modules. The app starts the backend
# when it opens and stops it when it closes. Data is stored in
# ~/Library/Application Support/Billing Timer.

set -euo pipefail

APP_NAME="Billing Timer"
APP_BUNDLE="$HOME/Applications/$APP_NAME.app"
EXECUTABLE_NAME="BillingTimer"
BUNDLE_ID="com.globalcrowley.BillingTimer"
EXPRESS_VERSION="^4.19.2"
DATA_DIR="$HOME/Library/Application Support/$APP_NAME"
LAUNCHAGENT="$HOME/Library/LaunchAgents/com.globalcrowley.billing-timer.plist"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_FILE="$PROJECT_DIR/macos/BillingTimerApp.swift"
ICON_MASTER="$PROJECT_DIR/macos/icon.png"

cd "$PROJECT_DIR"

# --- Tool checks ---------------------------------------------------------
for tool in swiftc node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: '$tool' not found on PATH. Please install it and retry." >&2
    exit 1
  fi
done

NODE_BIN="$(command -v node)"
NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"
echo "Using node: $NODE_BIN"

# --- Retire the old LaunchAgent (superseded by app-managed backend) ------
if [ -f "$LAUNCHAGENT" ]; then
  echo "Removing old LaunchAgent (backend is now managed by the app)..."
  launchctl unload "$LAUNCHAGENT" 2>/dev/null || true
  rm -f "$LAUNCHAGENT"
fi

# --- Build the UI --------------------------------------------------------
echo "Installing dependencies and building the UI..."
npm install --no-audit --no-fund
npm run build

# --- Assemble the app bundle --------------------------------------------
echo "Assembling app bundle..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/app"

# Bundle the server + built UI.
cp -R "$PROJECT_DIR/server" "$APP_BUNDLE/Contents/Resources/app/server"
cp -R "$PROJECT_DIR/dist" "$APP_BUNDLE/Contents/Resources/app/dist"

# Install production-only deps (express) inside the bundle.
cat > "$APP_BUNDLE/Contents/Resources/app/package.json" <<PKG_EOF
{
  "name": "billing-timer-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "express": "$EXPRESS_VERSION"
  }
}
PKG_EOF
( cd "$APP_BUNDLE/Contents/Resources/app" && npm install --omit=dev --no-audit --no-fund >/dev/null )

# Record the node binary the app should use to run the server.
printf '%s' "$NODE_BIN" > "$APP_BUNDLE/Contents/Resources/node-path"

# --- Icon ----------------------------------------------------------------
HAS_ICON=0
if [ -f "$ICON_MASTER" ] && command -v iconutil >/dev/null 2>&1; then
  echo "Building icon..."
  ICONSET_PARENT="$(mktemp -d)"
  ICONSET="$ICONSET_PARENT/AppIcon.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$ICON_MASTER" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$ICON_MASTER" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
  rm -rf "$ICONSET_PARENT"
  HAS_ICON=1
fi

# --- Info.plist ----------------------------------------------------------
cat > "$APP_BUNDLE/Contents/Info.plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>

    <key>CFBundleExecutable</key>
    <string>$EXECUTABLE_NAME</string>

    <key>CFBundleIconFile</key>
    <string>AppIcon</string>

    <key>CFBundleIdentifier</key>
    <string>$BUNDLE_ID</string>

    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>

    <key>CFBundleName</key>
    <string>$APP_NAME</string>

    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>

    <key>CFBundlePackageType</key>
    <string>APPL</string>

    <key>CFBundleShortVersionString</key>
    <string>1.0</string>

    <key>CFBundleVersion</key>
    <string>1</string>

    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>

    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
PLIST_EOF

# --- Compile the Swift app ----------------------------------------------
echo "Compiling app..."
swiftc \
  "$SOURCE_FILE" \
  -framework Cocoa \
  -framework WebKit \
  -o "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
chmod +x "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"

# --- Migrate existing data, if any --------------------------------------
mkdir -p "$DATA_DIR"
if [ ! -f "$DATA_DIR/state.json" ] && [ -f "$PROJECT_DIR/data/state.json" ]; then
  echo "Migrating existing data to ${DATA_DIR}"
  for f in state.json projects.json timesheet.log; do
    [ -f "$PROJECT_DIR/data/$f" ] && cp "$PROJECT_DIR/data/$f" "$DATA_DIR/$f"
  done
fi

# --- Sign (ad-hoc) -------------------------------------------------------
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || true
fi

echo
echo "Installed: $APP_BUNDLE"
[ "$HAS_ICON" -eq 1 ] && echo "Custom icon applied."
echo "Data dir:  $DATA_DIR"
echo "Open it from Finder/Spotlight or pin it to the Dock."
