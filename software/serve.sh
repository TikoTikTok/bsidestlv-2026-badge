#!/usr/bin/env bash
# Serve site/ exactly as GitHub Pages does: static files, nothing else.
# ES modules need http://, not file:// - that is the only reason this exists.
cd "$(dirname "$0")/site"
PORT="${1:-8080}"
echo "Alice in AI Land -> http://localhost:$PORT/"
exec python3 -m http.server "$PORT"
