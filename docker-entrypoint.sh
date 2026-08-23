#!/bin/sh
set -e

# /data is the persistent volume (Fly.io volume in prod, a named Docker
# volume locally). The SQLite file and uploaded images both live there so
# they survive container restarts/redeploys.
mkdir -p /data/uploads
ln -sfn /data/uploads /app/uploads

export DATABASE_URL="${DATABASE_URL:-file:/data/app.db}"

node ./node_modules/prisma/build/index.js migrate deploy

exec "$@"
