#!/usr/bin/env bash
set -euo pipefail

# Configuration
SERVER_IP="120.26.106.254"
SERVER_USER="root"
REMOTE_DIR="/opt/guangjiantong"

# Parse mode: default = IP test (HTTP only), --prod = HTTPS with domain
MODE="test"
if [[ "${1:-}" == "--prod" ]]; then
  MODE="prod"
fi

echo "==> Deploy mode: ${MODE}"

echo "==> Syncing code to server..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude .env.local \
  --exclude .env.production \
  --exclude .DS_Store \
  ./ "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"

echo "==> Building and starting containers..."
if [[ "$MODE" == "prod" ]]; then
  ssh "${SERVER_USER}@${SERVER_IP}" \
    "cd ${REMOTE_DIR} && docker compose -f docker-compose.yml -f docker-compose.prod.yml build && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
  echo "==> Done! App is running at https://laobanbiehuang.cn"
else
  ssh "${SERVER_USER}@${SERVER_IP}" \
    "cd ${REMOTE_DIR} && docker compose build && docker compose up -d"
  echo "==> Done! App is running at http://${SERVER_IP}"
fi
