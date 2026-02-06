import React, { useEffect, useState } from 'react';

type ServiceStatus = {
  service: string;
  running: boolean;
  pids: number[];
};

type StarterStatus = {
  services: ServiceStatus[];
};

type FileServiceCheck = {
  key: string;
  path: string;
  exists: boolean;
};

type FileServiceStatus = {
  ok: boolean;
  pid: number;
  uptimeSeconds: number;
  config: {
    paths: {
      base: { dbc: string; icons: string; description?: string };
      custom: { dbc: string; icons: string; description?: string };
    };
    settings?: {
      activeDBCSource?: 'base' | 'custom';
      activeIconSource?: 'base' | 'custom';
    };
  };
  active: {
    dbc: string;
    icons: string;
  };
  checks: FileServiceCheck[];
  missing: string[];
  watcher?: { status: string; message?: string };
  timestamp?: string;
};

type Props = {
  token: string | null;
  baseUrl: string;
  fileBaseUrl: string;
  textColor?: string;
  contentBoxColor?: string;
};

const ServerStarter: React.FC<Props> = ({ token, baseUrl, fileBaseUrl, textColor = '#000', contentBoxColor = '#f9f9f9' }) => {
  const [status, setStatus] = useState<StarterStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<FileServiceStatus | null>(null);
  const [fileStatusError, setFileStatusError] = useState<string | null>(null);
  const [fileStatusBusy, setFileStatusBusy] = useState(false);

  const fetchStatus = async () => {
    if (!token) return;
    try {
      setError(null);
      const res = await fetch(`${baseUrl}/api/starter/servers/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || 'Failed to fetch status');
        return;
      }
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    }
  };

  const doAction = async (service: string, action: 'start' | 'stop' | 'restart') => {
    if (!token) return;
    try {
      setError(null);
      setBusy(`${service}-${action}`);
      const res = await fetch(`${baseUrl}/api/starter/servers/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ service }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || `Failed to ${action} ${service}`);
        return;
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} ${service}`);
    } finally {
      setBusy(null);
    }
  };

  const restartStarter = async () => {
    if (!token) return;
    if (!window.confirm('This will restart the starter-server service. The page will need to be refreshed after a few seconds. Continue?')) {
      return;
    }
    try {
      setError(null);
      setBusy('starter-restart');
      await fetch(`${baseUrl}/api/starter/self-restart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      // Service will die, so we won't get a response
    } catch (err) {
      // Expected - server is restarting
    } finally {
      setBusy(null);
    }
  };

  const restartFileService = async () => {
    if (!window.confirm('This will restart the file service (server.js). Continue?')) {
      return;
    }
    try {
      setError(null);
      setBusy('file-restart');
      await fetch(`${fileBaseUrl}/api/self-restart`, {
        method: 'POST',
      });
      // Service will die, so we won't get a response
    } catch (err) {
      // Expected - server is restarting
    } finally {
      setBusy(null);
    }
  };

  const restartWebpage = async () => {
    if (!window.confirm('This will reload the webpage. Continue?')) {
      return;
    }
    try {
      setBusy('webpage-restart');
      // Reload after a short delay to show the restarting message
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      setError('Failed to restart webpage');
      setBusy(null);
    }
  };

  const restartNpmDevServer = async () => {
    if (!token) return;
    if (!window.confirm('This will restart the npm dev server (vite). Continue?')) {
      return;
    }
    try {
      setError(null);
      setBusy('npm-restart');
      const res = await fetch(`${baseUrl}/api/starter/npm-restart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || 'Failed to restart npm dev server');
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart npm dev server');
    } finally {
      setBusy(null);
    }
  };

  const fetchFileStatus = async () => {
    try {
      setFileStatusBusy(true);
      setFileStatusError(null);
      const res = await fetch(`${fileBaseUrl}/api/file-service-status`);
      const payload = await res.json();
      if (!res.ok) {
        setFileStatusError(payload.error || 'Failed to fetch file service status');
        return;
      }
      setFileStatus(payload);
    } catch (err) {
      setFileStatusError(err instanceof Error ? err.message : 'Failed to fetch file service status');
    } finally {
      setFileStatusBusy(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchFileStatus();
  }, [token, fileBaseUrl]);

  return (
    <div style={{ padding: 12, color: textColor }}>
      <h3>Server Starter</h3>
      <p style={{ opacity: 0.7 }}>
        Control auth/world servers from the web panel. Armory will be enabled when available.
      </p>
      <button onClick={fetchStatus} disabled={!token || busy !== null}>
        Refresh Status
      </button>
      {error && <div style={{ marginTop: 12, color: '#b91c1c' }}>{error}</div>}
      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {(status?.services || [
          { service: 'auth', running: false, pids: [] },
          { service: 'world', running: false, pids: [] },
          { service: 'armory', running: false, pids: [] },
        ]).map((svc) => (
          <div
            key={svc.service}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{svc.service}</div>
            <div style={{ color: svc.running ? '#16a34a' : '#b91c1c' }}>
              {svc.running ? 'Running' : 'Stopped'}
            </div>
            <div style={{ color: '#64748b', fontSize: 12 }}>
              {svc.pids.length > 0 ? `PIDs: ${svc.pids.join(', ')}` : 'No PIDs'}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={() => doAction(svc.service, 'start')}
                disabled={busy !== null}
              >
                Start
              </button>
              <button
                onClick={() => doAction(svc.service, 'stop')}
                disabled={busy !== null}
              >
                Stop
              </button>
              <button
                onClick={() => doAction(svc.service, 'restart')}
                disabled={busy !== null}
              >
                Restart
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Starter Service Control */}
      <div style={{ marginTop: 24, padding: 16, background: contentBoxColor, borderRadius: 8 }}>
        <h4 style={{ margin: 0, marginBottom: 8, color: textColor }}>Starter Service</h4>
        <p style={{ fontSize: 12, opacity: 0.7, margin: 0, marginBottom: 12 }}>
          Restart the starter-server service (handles authentication and server control). Page will need refresh after restart.
        </p>
        <button
          onClick={restartStarter}
          disabled={busy !== null}
          style={{
            padding: '8px 16px',
            background: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: busy !== null ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          {busy === 'starter-restart' ? 'Restarting...' : 'Restart Starter Service'}
        </button>
      </div>

      {/* File Service Control */}
      <div style={{ marginTop: 16, padding: 16, background: contentBoxColor, borderRadius: 8 }}>
        <h4 style={{ margin: 0, marginBottom: 8, color: textColor }}>File Service</h4>
        <p style={{ fontSize: 12, opacity: 0.7, margin: 0, marginBottom: 12 }}>
          Restart the file service (server.js - handles file uploads and DBC operations). Use after updating backend code.
        </p>
        <button
          onClick={restartFileService}
          disabled={busy !== null}
          style={{
            padding: '8px 16px',
            background: '#ffc107',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            cursor: busy !== null ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          {busy === 'file-restart' ? 'Restarting...' : 'Restart File Service'}
        </button>
      </div>

      {/* Webpage Restart */}
      <div style={{ marginTop: 24, padding: 16, background: contentBoxColor, borderRadius: 8 }}>
        <h4 style={{ margin: 0, marginBottom: 8, color: textColor }}>Webpage</h4>
        <p style={{ fontSize: 12, opacity: 0.7, margin: 0, marginBottom: 12 }}>
          Reload the webpage (Vite dev server). Use this if you've made code changes and need to refresh the UI.
        </p>
        <button
          onClick={restartWebpage}
          disabled={busy !== null}
          style={{
            padding: '8px 16px',
            background: '#17a2b8',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: busy !== null ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          {busy === 'webpage-restart' ? 'Restarting...' : 'Restart Webpage'}
        </button>
      </div>

      {/* NPM Dev Server Restart */}
      <div style={{ marginTop: 16, padding: 16, background: contentBoxColor, borderRadius: 8 }}>
        <h4 style={{ margin: 0, marginBottom: 8, color: textColor }}>NPM Dev Server</h4>
        <p style={{ fontSize: 12, opacity: 0.7, margin: 0, marginBottom: 12 }}>
          Restart npm dev server (vite). Use if the dev server is stuck or not responding.
        </p>
        <button
          onClick={restartNpmDevServer}
          disabled={busy !== null}
          style={{
            padding: '8px 16px',
            background: '#6f42c1',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: busy !== null ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          {busy === 'npm-restart' ? 'Restarting...' : 'Restart NPM Dev Server'}
        </button>
      </div>
      <div style={{ marginTop: 24 }}>
        <h4 style={{ margin: '0 0 8px 0' }}>File Service Status</h4>
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          Shows the backend file service health and whether the configured paths exist.
        </p>
        <button onClick={fetchFileStatus} disabled={fileStatusBusy}>
          {fileStatusBusy ? 'Refreshing...' : 'Refresh File Service'}
        </button>
        {fileStatusError && (
          <div style={{ marginTop: 12, color: '#b91c1c' }}>{fileStatusError}</div>
        )}
        <div
          style={{
            marginTop: 12,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 12,
            backgroundColor: contentBoxColor,
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>File Service</div>
            <div style={{ color: fileStatus ? '#16a34a' : '#b91c1c' }}>
              {fileStatus ? 'Online' : 'Offline'}
            </div>
            {fileStatus?.pid && (
              <div style={{ color: '#64748b', fontSize: 12 }}>
                PID: {fileStatus.pid} • Uptime: {fileStatus.uptimeSeconds}s
              </div>
            )}
          </div>

          {fileStatus && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#334155' }}>
                Active paths: DBC={fileStatus.active.dbc}, Icons={fileStatus.active.icons}
              </div>
              {fileStatus.missing?.length > 0 && (
                <div style={{ fontSize: 13, color: '#b91c1c' }}>
                  Missing folders: {fileStatus.missing.join(', ')}
                </div>
              )}
              <div style={{ display: 'grid', gap: 6 }}>
                {fileStatus.checks.map((entry) => (
                  <div key={entry.key} style={{ fontSize: 12, color: entry.exists ? '#16a34a' : '#b91c1c' }}>
                    {entry.key}: {entry.exists ? 'OK' : 'Missing'} — {entry.path}
                  </div>
                ))}
              </div>
              {fileStatus.watcher && (
                <div style={{ fontSize: 12, color: '#475569' }}>
                  Watcher: {fileStatus.watcher.status}{fileStatus.watcher.message ? ` — ${fileStatus.watcher.message}` : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServerStarter;
