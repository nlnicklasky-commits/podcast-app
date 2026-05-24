#!/bin/bash
# five-whys-gate.sh — Prevents the Five Whys agent hook from looping.
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
FLAG_DIR="/tmp/claude-five-whys"
FLAG_FILE="$FLAG_DIR/$SESSION_ID"
mkdir -p "$FLAG_DIR" 2>/dev/null
if [ -f "$FLAG_FILE" ]; then
  rm -f "$FLAG_FILE"
  exit 0
else
  touch "$FLAG_FILE"
  exit 0
fi
