#!/usr/bin/env bash
set -euo pipefail

# Server initialization script for Ubuntu 22.04 (2C2G ECS)
# Run as root: bash /opt/guangjiantong/scripts/setup-server.sh

echo "==> [1/4] System update..."
apt update && apt upgrade -y

echo "==> [2/4] Adding 1GB swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    Swap enabled."
else
  echo "    Swap already exists, skipping."
fi

echo "==> [3/4] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  echo "    Docker installed."
else
  echo "    Docker already installed, skipping."
fi

echo "==> [4/4] Installing Docker Compose plugin..."
if ! docker compose version &> /dev/null; then
  apt install -y docker-compose-plugin
  echo "    Docker Compose plugin installed."
else
  echo "    Docker Compose plugin already installed, skipping."
fi

echo ""
echo "==> Verification:"
docker --version
docker compose version
free -h | grep -i swap
echo ""
echo "==> Server setup complete!"
