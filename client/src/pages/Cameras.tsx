import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CameraRow } from '../lib/types';

const statusColor: Record<string, string> = {
  ONLINE: 'var(--ok)',
  OFFLINE: 'var(--danger)',
  UNKNOWN: 'var(--muted)',
};

export function Cameras() {
  const [cameras, setCameras] = useState<CameraRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CameraRow[]>('/cameras')
      .then(setCameras)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!cameras) return <div className="muted">Loading cameras…</div>;

  return (
    <div>
      <header className="page-head">
        <h1>Cameras</h1>
        <p className="muted">
          {cameras.length} camera(s) · {cameras.filter((c) => c.status === 'ONLINE').length} online
        </p>
      </header>

      {cameras.length === 0 ? (
        <div className="panel muted">No cameras registered yet.</div>
      ) : (
        <div className="stat-grid">
          {cameras.map((c) => (
            <div key={c.id} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label">{c.placement}</span>
                <span className="dot" style={{ background: statusColor[c.status] }} />
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{c.label}</div>
              <div
                style={{
                  background: '#0f172a',
                  height: 120,
                  borderRadius: 8,
                  margin: '10px 0',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#64748b',
                  fontSize: 13,
                }}
              >
                {c.status === 'ONLINE' ? '▶ live feed' : c.status.toLowerCase()}
              </div>
              <div className="stat-sub" style={{ color: 'var(--muted)' }}>
                {c.pharmacy.code} · {c.ipAddress}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted">
        Live RTSP/WebRTC streaming is proxied server-side in production; this view shows registration and
        health status.
      </p>
    </div>
  );
}
