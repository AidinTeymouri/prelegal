#!/usr/bin/env bash
# Stops and removes the Prelegal container (and with it, the database).
set -euo pipefail

if [[ -n "$(docker ps -aq --filter name=^prelegal$)" ]]; then
  docker rm -f prelegal >/dev/null
  echo "Prelegal stopped."
else
  echo "Prelegal is not running."
fi
