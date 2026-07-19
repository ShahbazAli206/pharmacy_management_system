import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SystemHealth, AuditEntry, CustomFieldDefinition } from '../lib/types';

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
      {can('custom_field:manage') && <CustomFieldsPanel />}
      <BackupsPanel />
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

interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function BackupsPanel() {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBackups(await api<BackupInfo[]>('/admin/backups'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await api('/admin/backups', { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const download = (filename: string) => {
    fetch(`${API_URL}/admin/backups/${encodeURIComponent(filename)}/download`, {
      headers: { Authorization: `Bearer ${tokenStore.access}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <section className="panel">
      <div className="page-head row">
        <h2 style={{ margin: 0 }}>Database backups</h2>
        <button className="btn btn-primary" onClick={create} disabled={creating}>
          {creating ? 'Creating…' : 'Create backup now'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        On-demand full-database dumps (pg_dump, custom format). Restore is a manual
        operation by design — see the runbook — not a one-click action here.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Filename</th>
              <th className="num">Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!backups && (
              <tr>
                <td colSpan={4} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {backups && backups.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No backups yet.
                </td>
              </tr>
            )}
            {backups?.map((b) => (
              <tr key={b.filename}>
                <td>{new Date(b.createdAt).toLocaleString('en-CA')}</td>
                <td className="mono" style={{ fontSize: 12 }}>{b.filename}</td>
                <td className="num">{fmtBytes(b.sizeBytes)}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => download(b.filename)}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'] as const;

function CustomFieldsPanel() {
  const [defs, setDefs] = useState<CustomFieldDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>('TEXT');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDefs(await api<CustomFieldDefinition[]>('/custom-fields/definitions?entityType=PATIENT'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const valid = /^[a-z][a-z0-9_]*$/.test(key) && label.trim() && (fieldType !== 'SELECT' || options.trim());

  const create = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api('/custom-fields/definitions', {
        method: 'POST',
        body: JSON.stringify({
          entityType: 'PATIENT',
          key,
          label: label.trim(),
          fieldType,
          ...(fieldType === 'SELECT'
            ? { options: options.split(',').map((o) => o.trim()).filter(Boolean) }
            : {}),
          required,
        }),
      });
      setKey('');
      setLabel('');
      setOptions('');
      setRequired(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create custom field');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (def: CustomFieldDefinition) => {
    await api(`/custom-fields/definitions/${def.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !def.active }),
    });
    await load();
  };

  return (
    <section className="panel">
      <h2>Custom fields (Patients)</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Extra fields shown on the patient create/edit form — no code change needed.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Label</th>
              <th>Type</th>
              <th>Required</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(!defs || defs.length === 0) && (
              <tr>
                <td colSpan={6} className="muted">
                  {defs ? 'No custom fields defined yet.' : 'Loading…'}
                </td>
              </tr>
            )}
            {defs?.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.key}</td>
                <td>{d.label}</td>
                <td>{d.fieldType}</td>
                <td>{d.required ? 'Yes' : 'No'}</td>
                <td>
                  <span className={`badge ${d.active ? 'badge-ok' : 'badge-muted'}`}>{d.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td>
                  <button className="btn btn-ghost" onClick={() => toggleActive(d)}>
                    {d.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <label className="field">
          Key
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="referred_by" />
        </label>
        <label className="field">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Referred by" />
        </label>
        <label className="field">
          Type
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as typeof fieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {fieldType === 'SELECT' && (
          <label className="field">
            Options (comma-separated)
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Walk-in, Referral, Website" />
          </label>
        )}
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required (UI hint only)
        </label>
        <button className="btn btn-primary" onClick={create} disabled={!valid || busy}>
          {busy ? 'Adding…' : 'Add field'}
        </button>
      </div>
    </section>
  );
}
