#!/usr/bin/env bash
# Builds the Prelegal Docker image and (re)starts it at http://localhost:8000.
# Each start creates a new container, so the database starts empty.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=prelegal
PORT=8000

env_file=()
if [[ -f .env ]]; then
  env_file=(--env-file .env)
else
  echo "Warning: no .env file in the project root; starting without API keys." >&2
fi

docker build -t "$NAME" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "$PORT:8000" ${env_file[@]+"${env_file[@]}"} "$NAME" >/dev/null

echo "Waiting for Prelegal to start..."
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    echo "Prelegal is running at http://localhost:$PORT"
    exit 0
  fi
  sleep 1
done
echo "Prelegal did not start. Logs:" >&2
docker logs "$NAME" >&2
exit 1
