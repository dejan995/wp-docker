#!/bin/bash
set -e

# Ensure required vars exist
: "${DB_NAME_ONE:?DB_NAME_ONE not set}"
: "${MYSQL_USER:?MYSQL_USER not set}"
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD not set}"

echo "Creating database $DB_NAME_ONE and granting privileges to $MYSQL_USER..."

mariadb -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS \`$DB_NAME_ONE\`;
    GRANT ALL PRIVILEGES ON \`$DB_NAME_ONE\`.* TO '$MYSQL_USER'@'%';
    FLUSH PRIVILEGES;
EOSQL