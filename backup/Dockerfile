
FROM debian:bookworm-slim

# Install dependencies: cron, bash, mysql-client, tar, su-exec equivalent
RUN apt-get update && apt-get install -y --no-install-recommends \
      cron bash mariadb-client tar gosu gzip tzdata \
  && rm -rf /var/lib/apt/lists/*

# Copy scripts
COPY backup.sh /usr/local/bin/backup.sh
COPY restore.sh /usr/local/bin/restore.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

# Copy crontab for root
COPY crontab.txt /etc/cron.d/backup-cron

# Cron expects 0644 perms on /etc/cron.d files
RUN chmod 0644 /etc/cron.d/backup-cron

# Copy entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Run cron in foreground so container stays alive
CMD ["cron", "-f"]
