#!/bin/bash
# tools/wiki/shot.sh URL OUT.png [WIDTH] [HEIGHT]
# Render one page with headless Chrome. Check layout with the result.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
  --window-size="${3:-1400},${4:-1000}" --screenshot="$2" "$1" 2>/dev/null
