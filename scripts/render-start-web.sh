#!/bin/sh
# Render web service (one-off, paid) — run DB migrations then start the API + site.
# On the free plan the filesystem is ephemeral: the SQLite DB is created fresh on
# each boot (no persistent disk). Migrations are idempotent, so this is safe.
set -e
cd server
DATABASE_URL="file:./prod.db" npx prisma migrate deploy --schema=prisma/schema.prisma
NODE_ENV=production DATABASE_URL="file:./prod.db" node dist/index.js
