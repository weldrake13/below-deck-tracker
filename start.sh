#!/usr/bin/env bash
#
# Start Below Deck Tracker locally.
#
#   ./start.sh            Run with Node directly, restarting on save (fastest).
#   ./start.sh --docker   Run in Docker, the same way the server does.
#   ./start.sh --prod     Build and run the production image locally.
#
set -euo pipefail

cd "$(dirname "$0")"

MODE="node"
case "${1:-}" in
  --docker) MODE="docker" ;;
  --prod)   MODE="prod" ;;
  -h|--help)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *)
    echo "Unknown option: $1 (try --help)" >&2
    exit 1
    ;;
esac

# Node runs outside Docker, so it doesn't get docker-compose's automatic .env
# loading — pick up AISSTREAM_API_KEY etc. from .env ourselves if it exists.
if [ "$MODE" = "node" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${HTTP_PORT:-3100}"

case "$MODE" in
  node)
    if ! command -v node >/dev/null 2>&1; then
      echo "Node.js is not installed. Install Node 20+ or use: ./start.sh --docker" >&2
      exit 1
    fi

    if [ ! -d node_modules ]; then
      echo "Installing dependencies..."
      npm install
    fi

    echo "Starting on http://localhost:$PORT (Ctrl+C to stop)"
    PORT="$PORT" npm run dev
    ;;

  docker)
    echo "Starting in Docker on http://localhost:$PORT (Ctrl+C to stop)"
    HTTP_PORT="$PORT" docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
    ;;

  prod)
    echo "Building the production image and starting on http://localhost:$PORT"
    HTTP_PORT="$PORT" docker compose up --build
    ;;
esac
