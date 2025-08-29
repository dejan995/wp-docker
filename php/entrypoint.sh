#!/bin/bash
set -euo pipefail

# Wait for MariaDB with authentication
echo "⏳ Waiting for MariaDB at $DB_HOST..."
until mariadb -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; do
  echo "   ↳ DB not ready yet, retrying..."
  sleep 2
done
echo "✅ MariaDB is ready and accepting connections!"

# Ensure database exists
echo "📂 Ensuring database '$DB_NAME' exists..."
mariadb -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;"

cd /var/www/html

# Download WordPress core if missing
if [ ! -f "wp-config-sample.php" ]; then
  echo "⬇️  Downloading WordPress core files..."
  wp core download --allow-root
fi

# Create wp-config.php if missing
if [ ! -f "wp-config.php" ]; then
  echo "⚙️  Generating wp-config.php..."
  wp config create \
    --dbname="$DB_NAME" \
    --dbuser="$DB_USER" \
    --dbpass="$DB_PASSWORD" \
    --dbhost="$DB_HOST" \
    --skip-check \
    --allow-root

  echo "🔑 Shuffling salts for extra security..."
  wp config shuffle-salts --allow-root
fi

# Install WordPress if not installed
if ! wp core is-installed --allow-root; then
  echo "⚡ Installing WordPress..."
  wp core install \
    --url="$WP_URL" \
    --title="$WP_TITLE" \
    --admin_user="$WP_ADMIN_USER" \
    --admin_password="$WP_ADMIN_PASSWORD" \
    --admin_email="$WP_ADMIN_EMAIL" \
    --skip-email \
    --allow-root

  # Initial plugin install (only on fresh install)
  if [ -n "${WP_PLUGINS:-}" ]; then
    echo "📦 Installing plugins: $WP_PLUGINS"
    wp plugin install $WP_PLUGINS --activate --allow-root
  fi
else
  echo "✅ WordPress already installed, skipping installation."
fi

### Extra WordPress bootstrap tweaks ###

WP_PATH="/var/www/html"

# Force FS_METHOD, site URL, and Redis definitions in wp-config.php
if ! grep -q "FS_METHOD" "$WP_PATH/wp-config.php"; then
  echo "🔧 Injecting FS_METHOD, site URL, and Redis settings into wp-config.php..."
  sed -i "/require_once ABSPATH . 'wp-settings.php';/i \
// Force direct filesystem writes (no FTP)\n\
define( 'FS_METHOD', 'direct' );\n\
\n\
// Set site URL from environment\n\
define( 'WP_HOME', '${WP_URL}' );\n\
define( 'WP_SITEURL', '${WP_URL}' );\n\
\n\
// Redis cache settings\n\
define( 'WP_REDIS_HOST', '${REDIS_HOST:-redis}' );\n\
define( 'WP_REDIS_PORT', ${REDIS_PORT:-6379} );\n\
define( 'WP_CACHE', true );\n" "$WP_PATH/wp-config.php"
fi

# 🔄 Ensure all plugins from .env are installed & activated (idempotent sync)
if [ -n "${WP_PLUGINS:-}" ]; then
  for plugin in $WP_PLUGINS; do
    if ! wp plugin is-installed "$plugin" --allow-root; then
      echo "📦 Installing new plugin: $plugin"
      wp plugin install "$plugin" --activate --allow-root
    elif ! wp plugin is-active "$plugin" --allow-root; then
      echo "✅ Activating existing plugin: $plugin"
      wp plugin activate "$plugin" --allow-root
    fi
  done
fi

# Fix ownership and permissions (critical for wp-admin)
echo "🔧 Fixing file permissions..."
chown -R www-data:www-data /var/www/html
find /var/www/html -type d -exec chmod 755 {} \;
find /var/www/html -type f -exec chmod 644 {} \;

# Start PHP-FPM
echo "🚀 Starting PHP-FPM..."
exec php-fpm -F
