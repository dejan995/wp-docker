#!/bin/bash
set -euo pipefail

KEEP="${BACKUP_KEEP:-14}"             # keep last N backups
STAMP="$(date +%F_%H-%M-%S)"
DEST="/backups/${STAMP}"

echo "📦 Starting backup: ${STAMP}"
mkdir -p "$DEST"

# DB dump
echo "   ↳ Dumping DB: ${DB_NAME}"
mysqldump -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "${DEST}/db.sql"

# Files (wp-content only for size; adjust to '.' to include full WP)
echo "   ↳ Archiving wp-content"
tar -czf "${DEST}/wp-content.tar.gz" -C /var/www/html wp-content

# Rotation by count (keep newest N)
echo "🧹 Rotation: keeping last ${KEEP} backups"
cd /backups
# list dirs sorted oldest->newest, delete surplus
COUNT=$(ls -1d 20* | wc -l | tr -d ' ')
if [ "${COUNT}" -gt "${KEEP}" ]; then
  DEL=$(( COUNT - KEEP ))
  echo "   ↳ Removing ${DEL} oldest backup(s)"
  ls -1d 20* | sort | head -n "${DEL}" | xargs -r rm -rf
else
  echo "   ↳ No rotation needed"
fi

echo "✅ Backup complete: ${STAMP}"
