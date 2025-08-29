#!/bin/bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: restore.sh [options] [backup-folder]

Options:
  --db-only       Restore only the database
  --files-only    Restore only WordPress files
  --dry-run       Preview actions without applying
  -h, --help      Show this help

Examples:
  restore.sh
  restore.sh --db-only 2025-08-28_02-00-00
EOF
}

RESTORE_DB=true
RESTORE_FILES=true
DRY_RUN=false

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only) RESTORE_FILES=false; shift ;;
    --files-only) RESTORE_DB=false; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- "${ARGS[@]:-}"

# Pick backup if not provided
if [ $# -eq 0 ]; then
  echo "📂 Available backups:"
  i=1; declare -A BK
  for d in /backups/*; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    echo "  [$i] $name"
    BK[$i]="$name"
    i=$((i+1))
  done
  if [ "${#BK[@]}" -eq 0 ]; then echo "❌ No backups found"; exit 1; fi
  read -p "Select a backup (or 'q' to quit): " pick
  [[ "$pick" == "q" ]] && { echo "🚪 Cancelled."; exit 0; }
  BACKUP="${BK[$pick]:-}"
  [ -n "$BACKUP" ] || { echo "❌ Invalid selection"; exit 1; }
else
  BACKUP="$1"
fi

SRC="/backups/$BACKUP"
[ -d "$SRC" ] || { echo "❌ Backup not found: $SRC"; exit 1; }

echo "♻️  Preparing to restore: $BACKUP"
read -p "⚠️  This will OVERWRITE current DB/files. Continue? (y/N): " ok
[[ "$ok" =~ ^[Yy]$ ]] || { echo "🚪 Cancelled."; exit 0; }

# Pre-restore snapshot
if [ "$DRY_RUN" = false ]; then
  SNAP="pre-restore-$(date +%F_%H-%M-%S)"
  SNAPDIR="/backups/$SNAP"
  echo "🛡️  Creating safety snapshot: $SNAP"
  mkdir -p "$SNAPDIR"
  mysqldump -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$SNAPDIR/db.sql" || true
  tar -czf "$SNAPDIR/wp-content.tar.gz" -C /var/www/html wp-content || true
fi

# Restore DB
if [ "$RESTORE_DB" = true ]; then
  if [ -f "$SRC/db.sql" ]; then
    echo "   ↳ Restore DB from $SRC/db.sql"
    if [ "$DRY_RUN" = false ]; then
      mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$SRC/db.sql"
    fi
  else
    echo "⚠️  Missing db.sql in backup"
  fi
fi

# Restore files
if [ "$RESTORE_FILES" = true ]; then
  if [ -f "$SRC/wp-content.tar.gz" ]; then
    echo "   ↳ Restore wp-content from $SRC/wp-content.tar.gz"
    if [ "$DRY_RUN" = false ]; then
      tar -xzf "$SRC/wp-content.tar.gz" -C /var/www/html
    fi
  else
    echo "⚠️  Missing wp-content.tar.gz in backup"
  fi
fi

if [ "$DRY_RUN" = true ]; then
  echo "✅ Dry-run only; no changes applied."
else
  echo "✅ Restore complete from $BACKUP"
  echo "↩️  Rollback point: $SNAP"
fi
