import React, { useEffect, useState } from 'react';

type ServiceStatus = {
  service: string;
  running: boolean;
  pids: number[];
};

type StarterStatus = {
  services: ServiceStatus[];
};

type Props = {
  token: string | null;
  baseUrl: string;
};

const ServerStarter: React.FC<Props> = ({ token, baseUrl }) => {
  const [status, setStatus] = useState<StarterStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  useEffect(() => {
    fetchStatus();
  }, [token]);

  return (
    <div style={{ padding: 12 }}>
      <h3>Server Starter</h3>
      <p style={{ color: '#555' }}>
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
      <div style={{ marginTop: 24, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
        <h4 style={{ margin: 0, marginBottom: 8 }}>Starter Service</h4>
        <p style={{ fontSize: 12, color: '#666', margin: 0, marginBottom: 12 }}>
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
    </div>
  );
};

export default ServerStarter;
