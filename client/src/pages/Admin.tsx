import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { SystemHealth } from '../lib/types';

export function Admin() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [newFlag, setNewFlag] = useState('');

  const load = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([
        api<SystemHealth>('/system/health'),
        api<{ flags: Record<string, boolean> }>('/feature-flags'),
      ]);
      setHealth(h);
      setFlags(f.flags);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (key: string, enabled: boolean) => {
    await api('/feature-flags', { method: 'PUT', body: JSON.stringify({ key, enabled, pharmacyId: null }) });
    await load();
  };

  const addFlag = async () => {
    if (!newFlag.trim()) return;
    await api('/feature-flags', { method: 'PUT', body: JSON.stringify({ key: newFlag.trim(), enabled: false, pharmacyId: null }) });
    setNewFlag('');
    await load();
  };

  if (error) return <div className="alert alert-error">{error}</div>;

  const fmtUptime = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

  return (
    <div>
      <header className="page-head">
        <h1>System Administration</h1>
        <p className="muted">Health monitoring and feature flags</p>
      </header>

      {health && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Status</div>
              <div className="stat-value" style={{ color: 'var(--ok)' }}>
                {health.status}
              </div>
              <div className="stat-sub" style={{ color: 'var(--muted)' }}>
                uptime {fmtUptime(health.uptimeSeconds)} · node {health.nodeVersion}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pharmacies</div>
              <div className="stat-value">{health.counts.pharmacies}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Patients</div>
              <div className="stat-value">{health.counts.patients.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Prescriptions</div>
              <div className="stat-value">{health.counts.prescriptions.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Open alerts</div>
              <div className="stat-value" style={{ color: health.operational.openComplianceAlerts > 0 ? 'var(--warn)' : undefined }}>
                {health.operational.openComplianceAlerts}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pending notifications</div>
              <div className="stat-value">{health.operational.pendingNotifications}</div>
            </div>
          </div>
        </>
      )}

      <section className="panel">
        <h2>Feature flags</h2>
        <div className="toolbar">
          <input className="search" placeholder="new-flag-key" value={newFlag} onChange={(e) => setNewFlag(e.target.value)} />
          <button className="btn" onClick={addFlag}>
            Add flag
          </button>
        </div>
        {Object.keys(flags).length === 0 ? (
          <p className="muted">No flags defined yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(flags).map(([key, enabled]) => (
                <tr key={key}>
                  <td className="mono">{key}</td>
                  <td>
                    <span className={`badge ${enabled ? 'badge-ok' : 'badge-muted'}`}>{enabled ? 'ON' : 'OFF'}</span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => toggle(key, !enabled)}>
                      {enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
