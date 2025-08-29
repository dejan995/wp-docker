import authRoutes from "./routes/auth.js";
import { authRequired } from "./middleware/auth.js";
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import archiver from 'archiver';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
app.use(cookieParser());
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const MODE = process.env.MODE || 'docker-exec';
const WP_CONTAINER = process.env.WP_CONTAINER || 'wordpress';
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || '/backup';
const BACKUPS_DIR = process.env.BACKUPS_DIR || '/backups';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDirectorySize(dirPath) {
  let total = 0;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      total += getDirectorySize(fullPath);
    } else {
      total += stats.size;
    }
  }
  return total;
}

// ✅ helper to prevent path traversal
function safeJoin(base, target) {
  const fp = path.resolve(base, target);
  if (!fp.startsWith(path.resolve(base))) {
    throw new Error('Path traversal');
  }
  return fp;
}

// Basic health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: MODE });
});

// List backups by folder name (sorted newest first)
app.get('/api/backups', authRequired, (req, res) => {
  try {
    const entries = fs.readdirSync(BACKUPS_DIR).map(item => {
      const full = path.join(BACKUPS_DIR, item);
      const st = fs.statSync(full);
      const size = st.isDirectory() ? getDirectorySize(full) : st.size;

      // Try parsing from filename: YYYY-MM-DD_HH-MM-SS
      let parsedDate = null;
      const match = item.match(/(\d{4}-\d{2}-\d{2})[_-](\d{2}-\d{2}-\d{2})/);
      if (match) {
        parsedDate = new Date(`${match[1]}T${match[2].replace(/-/g, ':')}`);
      }

      return {
        name: item,
        size,
        sizeFormatted: formatBytes(size),
        date: parsedDate ? parsedDate.toISOString() : st.mtime.toISOString()
      };
    });

    res.json({ backups: entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function runCommandStreaming(cmd, args, env = {}) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env } });
  return child;
}

// SSE stream registry
const jobs = new Map(); // jobId -> child process

app.get('/api/stream/:jobId', authRequired, (req, res) => {
  const { jobId } = req.params;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const child = jobs.get(jobId);
  if (!child) {
    res.write(`event: end\n`);
    res.write(`data: No such job\n\n`);
    return res.end();
  }

  const onStdout = (data) => {
    res.write(`data: ${data.toString('utf8')}\n\n`);
  };
  const onStderr = (data) => {
    res.write(`event: err\n`);
    res.write(`data: ${data.toString('utf8')}\n\n`);
  };
  const onClose = (code) => {
    res.write(`event: end\n`);
    res.write(`data: ${code}\n\n`);
    res.end();
  };

  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);
  child.on('close', onClose);

  req.on('close', () => {
    try {
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('close', onClose);
    } catch {}
  });
});

// Kick off a backup
app.post('/api/run-backup', authRequired, (req, res) => {
  const { dryRun = false, keep = undefined, extraEnv = {} } = req.body || {};
  const env = {
    BACKUP_KEEP: keep ? String(keep) : process.env.BACKUP_KEEP,
    DRY_RUN: dryRun ? 'true' : undefined,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    ...extraEnv,
  };

  let child;
  if (MODE === 'docker-exec') {
    child = runCommandStreaming('sh', ['-lc', `docker exec -i ${WP_CONTAINER} bash -lc '${SCRIPTS_DIR}/backup.sh'`], env);
  } else {
    child = runCommandStreaming('bash', ['-lc', `${SCRIPTS_DIR}/backup.sh`], env);
  }

  const jobId = `job_${Date.now()}`;
  jobs.set(jobId, child);

  child.on('close', () => jobs.delete(jobId));
  res.json({ ok: true, jobId });
});

// Restore
app.post('/api/restore', authRequired, (req, res) => {
  const { backupName, dbOnly = false, filesOnly = false, dryRun = false } = req.body || {};
  if (!backupName) return res.status(400).json({ error: 'backupName is required' });

  const flags = [
    dbOnly ? '--db-only' : '',
    filesOnly ? '--files-only' : '',
    dryRun ? '--dry-run' : ''
  ].filter(Boolean).join(' ');

  const cmd = MODE === 'docker-exec'
    ? `docker exec -i ${WP_CONTAINER} bash -lc '${SCRIPTS_DIR}/restore.sh ${flags} ${backupName}'`
    : `bash -lc '${SCRIPTS_DIR}/restore.sh ${flags} ${backupName}'`;

  const child = runCommandStreaming('sh', ['-lc', cmd], {});
  // auto-confirm interactive prompt
  child.stdin.write("y\n");
  child.stdin.end();
  const jobId = `job_${Date.now()}`;
  jobs.set(jobId, child);
  child.on('close', () => jobs.delete(jobId));
  res.json({ ok: true, jobId });
});

// Download backup (supports directories & files)
app.get('/api/download/:name', authRequired, (req, res) => {
  try {
    const backupPath = safeJoin(BACKUPS_DIR, req.params.name);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const stat = fs.statSync(backupPath);

    if (stat.isDirectory()) {
      // 📦 stream as zip if it's a directory
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.directory(backupPath, false);
      archive.on('error', err => {
        console.error('Archiver error:', err);
        res.status(500).end();
      });
      archive.pipe(res);
      archive.finalize();
    } else {
      // 📂 stream directly if it's a single file
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(backupPath)}"`);
      fs.createReadStream(backupPath).pipe(res);
    }
  } catch (e) {
    console.error('Download error:', e);
    res.status(400).json({ error: e.message });
  }
});

// ✅ Delete backup
app.post('/api/delete-backup', authRequired, (req, res) => {
  try {
    const { backupName } = req.body || {};
    if (!backupName) return res.status(400).json({ error: 'backupName required' });
    const filePath = safeJoin(BACKUPS_DIR, backupName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found' });
    }
    fs.rmSync(filePath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Serve static frontend (built)
app.use("/api/auth", authRoutes);
app.use(express.static('/app/client-dist'));
app.get('*', (req,res)=>{
  res.sendFile('/app/client-dist/index.html');
});

const port = process.env.PORT || 8080;
app.listen(port, ()=> console.log('Server listening on '+port));
