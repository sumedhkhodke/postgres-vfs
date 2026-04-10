#!/usr/bin/env bash
#
# Record a terminal demo of postgres-vfs for the README.
#
# Prerequisites:
#   brew install asciinema
#   npm install -g svg-term-cli  (optional, for SVG output)
#
# Usage:
#   # 1. Record the streaming demo (meetings seed)
#   ./examples/record-demo.sh stream
#
#   # 2. Record an ad-hoc query against the meetings tenant
#   ./examples/record-demo.sh query
#
#   # 3. Record both back-to-back
#   ./examples/record-demo.sh both
#
# Output:
#   diagrams/demo.cast       — asciinema recording
#   diagrams/demo.gif        — animated GIF (via agg)
#
# The script auto-trims idle time and sets a reasonable speed.

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-both}"
CAST="diagrams/demo.cast"
GIF="diagrams/demo.gif"

echo "Recording postgres-vfs demo (mode: $MODE)..."

record_stream() {
  asciinema rec --overwrite --cols 100 --rows 30 \
    --idle-time-limit 3 \
    --command "bun run examples/bash-tool-demo-stream.ts meetings" \
    "$CAST"
}

record_query() {
  asciinema rec --overwrite --cols 100 --rows 30 \
    --idle-time-limit 3 \
    --command 'bun run examples/bash-tool-demo-query.ts --tenant bash-tool-demo-meetings --prompt "Who has the most action items across all meetings? Summarize each persons tasks."' \
    "$CAST"
}

record_both() {
  # Record a scripted session that runs stream then query
  asciinema rec --overwrite --cols 100 --rows 30 \
    --idle-time-limit 3 \
    --command "bash -c '
      echo \"=== Demo 1: Streaming seed (meetings) ===\"
      echo
      bun run examples/bash-tool-demo-stream.ts meetings
      echo
      echo \"=== Demo 2: Ad-hoc query ===\"
      echo
      bun run examples/bash-tool-demo-query.ts \
        --tenant bash-tool-demo-meetings \
        --prompt \"Who has the most action items across all meetings?\"
    '" \
    "$CAST"
}

case "$MODE" in
  stream) record_stream ;;
  query)  record_query ;;
  both)   record_both ;;
  *)
    echo "Unknown mode: $MODE (use: stream, query, both)"
    exit 1
    ;;
esac

echo ""
echo "Recording saved to $CAST"
echo ""

# Convert to GIF if agg is available
if command -v agg &>/dev/null; then
  echo "Converting to GIF..."
  agg --cols 100 --rows 30 --speed 1.5 --theme monokai "$CAST" "$GIF"
  echo "GIF saved to $GIF"
elif command -v npx &>/dev/null; then
  echo "Converting to GIF via npx..."
  npx --yes asciicast2gif "$CAST" "$GIF" 2>/dev/null && echo "GIF saved to $GIF" || echo "Install agg for GIF conversion: cargo install --git https://github.com/asciinema/agg"
else
  echo "To convert to GIF, install agg: cargo install --git https://github.com/asciinema/agg"
  echo "Then run: agg --speed 1.5 --theme monokai $CAST $GIF"
fi

echo ""
echo "To embed in README, use:"
echo '  <p align="center"><img src="diagrams/demo.gif" width="780" alt="postgres-vfs demo"></p>'
