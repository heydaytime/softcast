#!/usr/bin/env bash
#
# Deploy the Softcast backend to the Raspberry Pi over ssh (no CI/CD).
#
# Usage:   ./deploy/deploy-to-pi.sh
# Requires: an ssh host alias `pi` that lands on the backend box, and that the
#           one-time setup in deploy/DEPLOY.md has already been done.
#
# It rsyncs the repo (minus the frontend and build/dev cruft) to the Pi, runs
# `bun install`, and restarts the systemd service. Secrets are NOT synced — they
# live in /etc/softcast/backend.env on the Pi only.

set -euo pipefail

PI_HOST="${PI_HOST:-pi}"
DEST="${DEST:-/home/heyday/softcast}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Syncing ${REPO_ROOT} -> ${PI_HOST}:${DEST}"
rsync -az --delete \
	--exclude '.git' \
	--exclude 'node_modules' \
	--exclude 'apps' \
	--exclude '.agents' \
	--exclude '**/.next' \
	--exclude '*.log' \
	--exclude '.DS_Store' \
	--exclude '.env' \
	--exclude '.env.local' \
	--exclude '.env.*.local' \
	"${REPO_ROOT}/" "${PI_HOST}:${DEST}/"

echo "==> Installing deps + restarting backend on ${PI_HOST}"
ssh "${PI_HOST}" "cd ${DEST} && ~/.bun/bin/bun install && sudo systemctl restart softcast-backend && sleep 1 && systemctl --no-pager --lines=8 status softcast-backend"

echo "==> Done. Health check:"
ssh "${PI_HOST}" "curl -fsS http://127.0.0.1:4000/health && echo"
