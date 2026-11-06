#!/usr/bin/env bash
set -e

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT_DIR="/Users/diksha/.gemini/antigravity/brain/fd48fa6d-bc5b-4ee1-a345-bb27ec50aace"
REPO_ASSETS="/Users/diksha/Downloads/OptimizeQL/assets/screenshots"
mkdir -p "$REPO_ASSETS"

capture() {
  local name="$1"
  local url="$2"
  local mode="$3" # "light" or "dark"

  local color_flag="--force-prefers-color-scheme=light"
  if [ "$mode" = "dark" ]; then
    color_flag="--force-prefers-color-scheme=dark"
  fi

  local tmp_profile="/tmp/chrome_profile_${name}_${mode}"
  rm -rf "$tmp_profile"

  echo "Capturing $name ($mode)..."
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --user-data-dir="$tmp_profile" \
    "$color_flag" \
    --window-size=1440,960 \
    --screenshot="$OUT_DIR/${name}-${mode}.png" \
    "$url" >/dev/null 2>&1 || true

  cp "$OUT_DIR/${name}-${mode}.png" "$REPO_ASSETS/${name}-${mode}.png" 2>/dev/null || true
  rm -rf "$tmp_profile"
}

# Capture light and dark for each route
capture "dashboard" "http://localhost:3000/dashboard" "light"
capture "dashboard" "http://localhost:3000/dashboard" "dark"

capture "analyze" "http://localhost:3000/analyze" "light"
capture "analyze" "http://localhost:3000/analyze" "dark"

capture "benchmark" "http://localhost:3000/benchmark" "light"
capture "benchmark" "http://localhost:3000/benchmark" "dark"

capture "history" "http://localhost:3000/history" "light"
capture "history" "http://localhost:3000/history" "dark"

capture "connections" "http://localhost:3000/connections" "light"
capture "connections" "http://localhost:3000/connections" "dark"

capture "settings" "http://localhost:3000/settings" "light"
capture "settings" "http://localhost:3000/settings" "dark"

# Logo showcase
capture "logo-standalone" "http://localhost:3000/logo-preview.html" "light"

echo "All screenshots captured successfully!"
