#!/bin/bash
set -e

TARGET_DIR=${WORKDIR:-/var/www/html}
TARGET_UID=$(stat -c %u "$TARGET_DIR")
TARGET_GID=$(stat -c %g "$TARGET_DIR")

# Remap www-data if needed
if [ "$TARGET_UID" -ne 0 ]; then
  echo "Remapping www-data to UID:$TARGET_UID GID:$TARGET_GID"
  groupmod -o -g "$TARGET_GID" www-data
  usermod -o -u "$TARGET_UID" -g "$TARGET_GID" www-data
fi

exec "$@"
