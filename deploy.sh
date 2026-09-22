#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "==> Pulling latest changes from Git..."
git pull origin main

echo "==> Rebuilding and restarting Docker containers..."
docker compose up -d --build

echo "==> Cleaning up unused images..."
docker image prune -f

echo "==> Deployment complete!"
