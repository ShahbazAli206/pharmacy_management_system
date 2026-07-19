import { useCallback, useEffect, useState } from 'react';
import { api, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SystemHealth, AuditEntry } from '../lib/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

const ROLE_NAMES = [
  'SYSTEM_OWNER', 'LOCATION_PARTNER', 'PHARMACIST_IN_CHARGE', 'PHARMACY_TECHNICIAN',
  'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT',
];

export function Admin() {
  const { can } = useAuth();
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
        <p className="muted">Health monitoring, feature flags, and platform tools</p>
      </header>

      {health && (
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

      {can('role:simulate') && <RoleSimulator />}
      <ActivityTimeline />
      <BarcodeTool />
    </div>
  );
}

function RoleSimulator() {
  const [role, setRole] = useState('CASHIER');
  const [perms, setPerms] = useState<string[] | null>(null);

  const run = useCallback(async (r: string) => {
    const res = await api<{ role: string; permissions: string[] }>(`/admin/role-simulator/${r}`);
    setPerms(res.permissions);
  }, []);

  useEffect(() => {
    void run(role);
  }, [role, run]);

  return (
    <section className="panel">
      <h2>Role simulator</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Effective permissions granted to each role.
      </p>
      <div className="form-row">
        <label className="field">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_NAMES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {perms?.length === 0 && <span className="muted">No permissions.</span>}
        {perms?.map((p) => (
          <span key={p} className="badge badge-muted mono">
            {p}
          </span>
        ))}
      </div>
    </section>
  );
}

function ActivityTimeline() {
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const [events, setEvents] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    if (!entity.trim() || !entityId.trim()) return;
    setError(null);
    try {
      setEvents(await api<AuditEntry[]>(`/admin/timeline?entity=${encodeURIComponent(entity.trim())}&entityId=${encodeURIComponent(entityId.trim())}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="panel">
      <h2>Activity timeline</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Immutable audit history for a specific record (e.g. Patient, Prescription, WorkflowRequest).
      </p>
      <div className="form-row">
        <label className="field">
          Entity
          <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Prescription" />
        </label>
        <label className="field">
          Entity ID
          <input value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={lookup} disabled={!entity.trim() || !entityId.trim()}>
          Look up
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {events && (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No history for this record.
                </td>
              </tr>
            )}
            {events.map((ev) => (
              <tr key={ev.id}>
                <td>{new Date(ev.createdAt).toLocaleString('en-CA')}</td>
                <td>
                  <span className="badge badge-muted">{ev.action}</span>
                </td>
                <td>{ev.user ? `${ev.user.firstName} ${ev.user.lastName}` : 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BarcodeTool() {
  const [format, setFormat] = useState<'code39' | 'qr'>('code39');
  const [value, setValue] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!value.trim()) return;
    setError(null);
    setSvg(null);
    try {
      const endpoint = format === 'qr' ? 'qrcode' : 'barcode';
      const res = await fetch(`${API_URL}/admin/${endpoint}?value=${encodeURIComponent(value.trim())}`, {
        headers: { Authorization: `Bearer ${tokenStore.access}` },
      });
      if (!res.ok) {
        throw new Error(
          format === 'qr' ? 'Could not generate QR code' : 'Could not generate barcode (Code39 supports A-Z, 0-9 and - . $ / + %)',
        );
      }
      setSvg(await res.text());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="panel">
      <h2>Barcode &amp; QR labels</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Generate a label code for a DIN or shelf/patient record. QR holds far more data (e.g. a
        full URL) than Code39.
      </p>
      <div className="form-row">
        <label className="field">
          Format
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as 'code39' | 'qr');
              setSvg(null);
              setError(null);
            }}
          >
            <option value="code39">Code39 barcode</option>
            <option value="qr">QR code</option>
          </select>
        </label>
        <label className="field">
          Value
          <input
            value={value}
            onChange={(e) => setValue(format === 'code39' ? e.target.value.toUpperCase() : e.target.value)}
            placeholder="02240000"
          />
        </label>
        <button className="btn btn-primary" onClick={generate} disabled={!value.trim()}>
          Generate
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
    </section>
  );
}
