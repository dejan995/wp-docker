
import React, { useEffect, useState, useRef } from 'react';
import {
  IconPlayerPlay,
  IconRestore,
  IconRefresh,
  IconPlayerStop,
  IconCheck,
  IconX,
  IconInfoCircle,
  IconAlertTriangle,
  IconCopy,
  IconTrash,
  IconDownload,
  IconChevronDown,
  IconChevronUp,
  IconDatabase,
  IconFileText,
  IconLoader2,
} from '@tabler/icons-react';

const API = '/api';

function useSSE(jobId) {
  const [lines, setLines] = useState([]);
  const [ended, setEnded] = useState(false);
  const [hadError, setHadError] = useState(false);
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`${API}/stream/${jobId}`);
    es.onmessage = (e) => {
      const text = e.data;
      setLines((l) => [...l, ...text.split(/\r?\n/).filter(Boolean)]);
    };
    es.addEventListener('err', (e) => {
      setHadError(true);
      setLines((l) => [...l, `ERR: ${e.data}`]);
    });
    es.addEventListener('end', () => {
      setEnded(true);
      es.close();
    });
    return () => es.close();
  }, [jobId]);
  return { lines, ended, hadError, setLines };
}

function Card({ children }) {
  return <div className="card shadow-sm rounded-2xl mb-3">{children}</div>;
}

// Toast component (untouched)
function Toast({ id, message, type, onClose }) {
  const bgClass =
    type === "success"
      ? "bg-success"
      : type === "danger"
      ? "bg-danger"
      : type === "warning"
      ? "bg-warning text-dark"
      : "bg-primary";

  const icon =
    type === "success" ? <IconCheck size={20} /> :
    type === "danger" ? <IconX size={20} /> :
    type === "warning" ? <IconAlertTriangle size={20} /> :
    <IconInfoCircle size={20} />;

  return (
    <div
      className={`toast align-items-center show mb-2 text-white ${bgClass}`}
      role="alert"
      style={{ minWidth: "250px", maxWidth: "90vw" }}
    >
      <div className="d-flex align-items-center">
        <div className="p-2">{icon}</div>
        <div className="toast-body flex-grow-1">{message}</div>
        <button
          type="button"
          className="btn-close btn-close-white me-2 m-auto"
          onClick={() => onClose(id)}
        ></button>
      </div>
    </div>
  );
}

// Helpers
function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return "—";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
}

function parseDateFromName(name) {
  const match = name.match(/(20\d{6,8})(?:-(\d{4}))?/);
  if (match) {
    const dateStr = match[1];
    let formatted = "";
    if (dateStr.length === 8) {
      formatted = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
    } else if (dateStr.length === 6) {
      formatted = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}`;
    }
    if (match[2]) {
      const hh = match[2].slice(0,2);
      const mm = match[2].slice(2,4);
      formatted += ` ${hh}:${mm}`;
    }
    return formatted;
  }
  return "—";
}

export default function App() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [runOpts, setRunOpts] = useState({ dryRun: false, keep: '' });
  const [restoreOpts, setRestoreOpts] = useState({
    backupName: '',
    dbOnly: false,
    filesOnly: false,
    dryRun: false,
  });

  const { lines, ended, hadError, setLines } = useSSE(jobId);

  // ✅ Toasts
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (ended) {
      addToast(
        hadError ? "Job finished with errors." : "Job finished successfully.",
        hadError ? "danger" : "success"
      );
    }
  }, [ended, hadError]);

  const refresh = async () => {
    setLoading(true);
    const r = await fetch(`${API}/backups`);
    const j = await r.json();
    // normalize: backend may send array of names OR objects
    const norm = (j.backups || []).map((b) =>
      typeof b === "string" ? { name: b } : b
    );
    setBackups(norm);
    setLoading(false);
  };
  useEffect(() => {
    refresh();
  }, []);

  const runBackup = async () => {
    const r = await fetch(`${API}/run-backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runOpts),
    });
    const j = await r.json();
    setJobId(j.jobId);
  };

  const restore = async (backupName = null) => {
    const name = backupName || restoreOpts.backupName;
    if (!name) return alert('Choose a backup');
    const r = await fetch(`${API}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...restoreOpts, backupName: name }),
    });
    const j = await r.json();
    setJobId(j.jobId);
  };

  // Row-level action loading state
  const [rowBusy, setRowBusy] = useState({}); // { [name]: 'delete' | 'download' }

  const downloadBackup = async (name) => {
    try {
      setRowBusy((s) => ({ ...s, [name]: 'download' }));
      const res = await fetch(`${API}/download/${encodeURIComponent(name)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast(`Download started for ${name}`, "info");
    } catch (e) {
      addToast(`Failed to download ${name}`, "danger");
    } finally {
      setRowBusy((s) => {
        const { [name]: _, ...rest } = s;
        return rest;
      });
    }
  };

  const deleteBackup = async (name) => {
    if (!window.confirm(`Delete backup ${name}?`)) return;
    try {
      setRowBusy((s) => ({ ...s, [name]: 'delete' }));
      const r = await fetch(`${API}/delete-backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupName: name }),
      });
      const j = await r.json();
      if (j && j.success) {
        addToast(`Deleted ${name}`, "warning");
        refresh();
      } else {
        throw new Error(j?.error || "Unknown error");
      }
    } catch (e) {
      addToast(`Failed to delete ${name}`, "danger");
    } finally {
      setRowBusy((s) => {
        const { [name]: _, ...rest } = s;
        return rest;
      });
    }
  };

  // ✅ Log Viewer state
  const logRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    setAutoScroll(scrollHeight - scrollTop <= clientHeight + 20);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(lines.join("\n"));
    addToast("Logs copied to clipboard", "success");
  };

  const clearLogs = () => {
    setLines([]);
    addToast("Logs cleared", "info");
  };

  const downloadLogs = () => {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "logs.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlightLine = (line) => {
    if (line.startsWith("ERR:")) {
      return <div style={{ color: "red", fontWeight: "bold" }}>{line}</div>;
    }
    if (line.startsWith("WARN:")) {
      return <div style={{ color: "orange" }}>{line}</div>;
    }
    if (line.includes("DONE") || line.startsWith("OK:")) {
      return <div style={{ color: "green" }}>{line}</div>;
    }
    return <div>{line}</div>;
  };

  return (
    <div className="container my-4">
      <h2 className="mb-3">WordPress Backup & Restore</h2>

      {/* Toast Container bottom-right */}
      <div
        className="toast-container position-fixed bottom-0 end-0 p-3"
        style={{ zIndex: 1100 }}
      >
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onClose={removeToast} />
        ))}
      </div>

      <div className="row g-3">
        {/* Left column */}
        <div className="col-md-6">
          {/* ✅ Fancy Backup List */}
          <Card>
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title">Available Backups</h3>
              <button className="btn btn-sm btn-outline" onClick={refresh}>
                <IconRefresh size={18} /> Refresh
              </button>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="d-flex align-items-center gap-2">
                  <IconLoader2 className="spinner-border" size={18} />
                  <span>Loading...</span>
                </div>
              ) : backups.length ? (
                <div className="table-responsive">
                  <table className="table table-striped table-hover align-middle">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Date</th>
                        <th>Size</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((b) => {
                        const name = b.name || b;
                        const busy = rowBusy[name];
                        return (
                          <tr key={name}>
                            <td style={{wordBreak: 'break-all'}}>{b.name}</td>
                            <td>{b.date ? new Date(b.date).toLocaleString() : "—"}</td>
                            <td>{b.sizeFormatted || "—"}</td>
                            <td className="text-end">
                              <div className="btn-group btn-group-sm" role="group">
                                <button
                                  className="btn btn-outline-primary"
                                  title="Restore this backup"
                                  onClick={() => restore(name)}
                                  disabled={!!busy}
                                >
                                  <IconRestore size={16} />
                                </button>
                                <button
                                  className="btn btn-outline-success"
                                  title="Download this backup"
                                  onClick={() => downloadBackup(name)}
                                  disabled={busy === 'download'}
                                >
                                  {busy === 'download' ? <IconLoader2 className="spinner-border" size={16} /> : <IconDownload size={16} />}
                                </button>
                                <button
                                  className="btn btn-outline-danger"
                                  title="Delete this backup"
                                  onClick={() => deleteBackup(name)}
                                  disabled={busy === 'delete'}
                                >
                                  {busy === 'delete' ? <IconLoader2 className="spinner-border" size={16} /> : <IconTrash size={16} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-muted text-center py-3">
                  No backups found. Run a backup to see it here.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <h3 className="card-title">Run Backup</h3>
            </div>
            <div className="card-body">
              <div className="mb-2">
                <label>Keep (days)</label>
                <input
                  type="number"
                  className="form-control"
                  value={runOpts.keep}
                  onChange={(e) =>
                    setRunOpts({ ...runOpts, keep: e.target.value })
                  }
                />
              </div>
              <div className="form-check mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={runOpts.dryRun}
                  onChange={(e) =>
                    setRunOpts({ ...runOpts, dryRun: e.target.checked })
                  }
                  id="dryRunCheck"
                />
                <label className="form-check-label" htmlFor="dryRunCheck">
                  Dry run
                </label>
              </div>
              <button className="btn btn-success" onClick={runBackup}>
                <IconPlayerPlay size={18} /> Run
              </button>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="col-md-6">
          <Card>
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title">Restore Options</h3>
            </div>
            <div className="card-body">
              <select
                className="form-select mb-2"
                value={restoreOpts.backupName}
                onChange={(e) =>
                  setRestoreOpts({ ...restoreOpts, backupName: e.target.value })
                }
              >
                <option value="">Select a backup from the list</option>
                {backups.map((b) => {
                  const name = b.name || b;
                  return (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  );
                })}
              </select>
              <div className="form-check mb-2 form-check-inline">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={restoreOpts.dbOnly}
                  onChange={(e) =>
                    setRestoreOpts({ ...restoreOpts, dbOnly: e.target.checked })
                  }
                  id="dbOnlyCheck"
                />
                <label className="form-check-label" htmlFor="dbOnlyCheck">
                  <IconDatabase size={16} /> DB only
                </label>
              </div>
              <div className="form-check mb-2 form-check-inline">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={restoreOpts.filesOnly}
                  onChange={(e) =>
                    setRestoreOpts({
                      ...restoreOpts,
                      filesOnly: e.target.checked,
                    })
                  }
                  id="filesOnlyCheck"
                />
                <label className="form-check-label" htmlFor="filesOnlyCheck">
                  <IconFileText size={16} /> Files only
                </label>
              </div>
              <div className="form-check mb-2 form-check-inline">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={restoreOpts.dryRun}
                  onChange={(e) =>
                    setRestoreOpts({
                      ...restoreOpts,
                      dryRun: e.target.checked,
                    })
                  }
                  id="restoreDryRunCheck"
                />
                <label
                  className="form-check-label"
                  htmlFor="restoreDryRunCheck"
                >
                  Dry run
                </label>
              </div>
              <button className="btn btn-warning pull-right" onClick={() => restore()}>
                <IconRestore size={18} /> Restore Selected
              </button>
              </div>
          </Card>

          {/* ✅ Enhanced Live Logs (collapsible) */}
          <Card>
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title">Live Logs</h3>
              <div className="card-actions d-flex gap-2">
                <button className="btn btn-sm btn-outline" onClick={() => setCollapsed(!collapsed)}>
                  {collapsed ? <IconChevronDown size={18} /> : <IconChevronUp size={18} />}
                </button>
                <button className="btn btn-sm btn-outline" onClick={copyLogs}>
                  <IconCopy size={18} />
                </button>
                <button className="btn btn-sm btn-outline" onClick={clearLogs}>
                  <IconTrash size={18} />
                </button>
                <button className="btn btn-sm btn-outline" onClick={downloadLogs}>
                  <IconDownload size={18} />
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => location.reload()}
                >
                  <IconPlayerStop size={18} />
                </button>
              </div>
            </div>
            {!collapsed && (
              <div
                className="card-body"
                style={{
                  minHeight: 240,
                  maxHeight: 400,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  fontFamily:
                    'monospace, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"',
                }}
                ref={logRef}
                onScroll={handleScroll}
              >
                {jobId ? (
                  <pre className="m-0" style={{ whiteSpace: "pre-wrap" }}>
                    {lines.map((line, idx) => (
                      <div key={idx}>{highlightLine(line)}</div>
                    ))}
                  </pre>
                ) : (
                  <div className="text-muted">No job running.</div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
