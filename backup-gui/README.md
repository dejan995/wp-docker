# Backup GUI (React + Express, Tabler UI)

This container provides a simple GUI to run your existing `backup/backup.sh` and `backup/restore.sh` scripts in your WordPress stack.

## How it works

- The backend exposes REST endpoints and streams script output via Server-Sent Events (SSE).
- By default it **executes the scripts inside your existing backup container** (`MODE=docker-exec`). It requires access to the Docker socket.
- Alternatively, set `MODE=direct` and mount the same volumes + tools so the scripts can run directly in this container.

## Endpoints

- `GET /api/health`
- `GET /api/backups` — lists folders in `/backups`
- `POST /api/run-backup` — body: `{ dryRun?: boolean, keep?: number }`
- `POST /api/restore` — body: `{ backupName: string, dbOnly?: boolean, filesOnly?: boolean, dryRun?: boolean }`
- `GET /api/stream/:jobId` — SSE stream for realtime logs

## Docker Compose (add to your project)

```yaml
  backup-gui:
    build: ./backup-gui
    container_name: wp_backup_gui
    restart: unless-stopped
    environment:
      - MODE=docker-exec
      - WP_CONTAINER=wp_backup
      - SCRIPTS_DIR=/usr/local/bin
      - BACKUPS_DIR=/backups
      - DB_HOST=${DB_HOST}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./backups:/backups:rw
      - ./backup:/backup:ro
      - wp_data:/var/www/html
    ports:
      - "8088:8080"
    depends_on:
      - backup
```

If you prefer **direct** mode, ensure this service has access to the same paths and tools your scripts expect (e.g., `/var/www/html`, `mysql-client`), and set `MODE=direct`. You may also need to mount the WordPress files volume and network to reach the DB.

## Local development

```
# in one terminal
cd server && npm i && npm run dev

# in another
cd client && npm i && npm run dev
```

## Build image

```
docker build -t backup-gui .
```

Then add the service to your `docker-compose.yml` as shown above.
