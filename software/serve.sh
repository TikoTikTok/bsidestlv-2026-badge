#!/usr/bin/env bash
# ES modules need http://, not file:// - this is the whole build system.
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "Alice in AI Land assets -> http://localhost:$PORT/"
exec python3 -m http.server "$PORT"
