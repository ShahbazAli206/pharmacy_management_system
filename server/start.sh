#!/bin/bash
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting Pharmacy API on port $PORT"
node dist/index.js
