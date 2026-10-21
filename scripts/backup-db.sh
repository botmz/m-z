#!/usr/bin/env bash
# Read-only export. Run privately; do not attach the dump to chat or commit it.
set -euo pipefail
umask 077
: "${DATABASE_URL:?Configure DATABASE_URL securely}"
command -v pg_dump >/dev/null || { echo "PostgreSQL client tools (pg_dump) are required" >&2; exit 1; }
mkdir -p generated-artifacts/backups
file="generated-artifacts/backups/mz-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$file"
echo "Backup created in $file. Encrypt it and move it to private durable storage."
