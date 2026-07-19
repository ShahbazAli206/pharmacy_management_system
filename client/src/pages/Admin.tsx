import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Bell, Building2, FileText, Plus, Users } from 'lucide-react';
import { api, ApiError, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatCard } from '../components/StatCard';
import { useI18n } from '../lib/i18n/I18nContext';
import type { TranslationKey } from '../lib/i18n/translations';
import type { SystemHealth, AuditEntry, CustomFieldDefinition } from '../lib/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

const ROLE_NAMES = [
  'SYSTEM_OWNER', 'LOCATION_PARTNER', 'PHARMACIST_IN_CHARGE', 'PHARMACY_TECHNICIAN',
  'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT',
];

export function Admin() {
  const { can } = useAuth();
  const { t } = useI18n();
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
        <h1>{t('adminHeading')}</h1>
        <p className="muted">{t('adminSubtitle')}</p>
      </header>

      {health && (
        <div className="stat-grid">
          <StatCard
            icon={Activity}
            label={t('colStatus')}
            value={health.status}
            valueColor="var(--ok)"
            sub={t('uptimeNodeSub', { uptime: fmtUptime(health.uptimeSeconds), node: health.nodeVersion })}
          />
          <StatCard icon={Building2} accent="blue" label={t('statPharmacies')} value={String(health.counts.pharmacies)} />
          <StatCard icon={Users} label={t('statPatients')} value={health.counts.patients.toLocaleString()} />
          <StatCard icon={FileText} accent="purple" label={t('statPrescriptions')} value={health.counts.prescriptions.toLocaleString()} />
          <StatCard
            icon={AlertTriangle}
            accent="rose"
            label={t('statOpenAlerts')}
            value={String(health.operational.openComplianceAlerts)}
            valueColor={health.operational.openComplianceAlerts > 0 ? 'var(--warn)' : undefined}
          />
          <StatCard icon={Bell} accent="amber" label={t('statPendingNotifications')} value={String(health.operational.pendingNotifications)} />
        </div>
      )}

      <section className="panel">
        <h2>{t('featureFlagsHeading')}</h2>
        <div className="toolbar">
          <input className="search" placeholder={t('newFlagKeyPlaceholder')} value={newFlag} onChange={(e) => setNewFlag(e.target.value)} />
          <button className="btn" onClick={addFlag}>
            <Plus size={16} />
            {t('addFlagButton')}
          </button>
        </div>
        {Object.keys(flags).length === 0 ? (
          <p className="muted">{t('noFlagsDefinedYet')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('colKey')}</th>
                <th>{t('colEnabled')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(flags).map(([key, enabled]) => (
                <tr key={key}>
                  <td className="mono">{key}</td>
                  <td>
                    <span className={`badge ${enabled ? 'badge-ok' : 'badge-muted'}`}>{enabled ? t('on') : t('off')}</span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => toggle(key, !enabled)}>
                      {enabled ? t('disableButton') : t('enableButton')}
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
  const { t } = useI18n();
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
      <h2>{t('roleSimulatorHeading')}</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        {t('roleSimulatorDesc')}
      </p>
      <div className="form-row">
        <label className="field">
          {t('roleLabel')}
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
        {perms?.length === 0 && <span className="muted">{t('noPermissions')}</span>}
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
  const { t } = useI18n();
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
      <h2>{t('activityTimelineHeading')}</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        {t('activityTimelineDesc')}
      </p>
      <div className="form-row">
        <label className="field">
          {t('entityLabel')}
          <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder={t('entityPlaceholderPrescription')} />
        </label>
        <label className="field">
          {t('entityIdLabel')}
          <input value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={lookup} disabled={!entity.trim() || !entityId.trim()}>
          {t('lookUpButton')}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {events && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('colWhen')}</th>
              <th>{t('colAction')}</th>
              <th>{t('colUser')}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  {t('noHistoryForRecord')}
                </td>
              </tr>
            )}
            {events.map((ev) => (
              <tr key={ev.id}>
                <td>{new Date(ev.createdAt).toLocaleString('en-CA')}</td>
                <td>
                  <span className="badge badge-muted">{ev.action}</span>
                </td>
                <td>{ev.user ? `${ev.user.firstName} ${ev.user.lastName}` : t('systemLabel')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BarcodeTool() {
  const { t } = useI18n();
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
        throw new Error(format === 'qr' ? t('qrGenerationFailedMsg') : t('barcodeGenerationFailedMsg'));
      }
      setSvg(await res.text());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="panel">
      <h2>{t('barcodeQrHeading')}</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        {t('barcodeQrDesc')}
      </p>
      <div className="form-row">
        <label className="field">
          {t('formatLabel')}
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as 'code39' | 'qr');
              setSvg(null);
              setError(null);
            }}
          >
            <option value="code39">{t('code39Option')}</option>
            <option value="qr">{t('qrOption')}</option>
          </select>
        </label>
        <label className="field">
          {t('valueLabel')}
          <input
            value={value}
            onChange={(e) => setValue(format === 'code39' ? e.target.value.toUpperCase() : e.target.value)}
            placeholder={t('valuePlaceholderDin')}
          />
        </label>
        <button className="btn btn-primary" onClick={generate} disabled={!value.trim()}>
          {t('generateButton')}
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
  const { t } = useI18n();
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
        <h2 style={{ margin: 0 }}>{t('databaseBackupsHeading')}</h2>
        <button className="btn btn-primary" onClick={create} disabled={creating}>
          {creating ? t('creatingEllipsis') : t('createBackupNowButton')}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {t('backupsDesc')}
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('colCreated')}</th>
              <th>{t('colFilename')}</th>
              <th className="num">{t('colSize')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!backups && (
              <tr>
                <td colSpan={4} className="muted">
                  {t('loading')}
                </td>
              </tr>
            )}
            {backups && backups.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  {t('noBackupsYet')}
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
                    {t('downloadButton')}
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

const ENTITY_TYPES = ['PATIENT', 'PRODUCT'] as const;
const ENTITY_LABEL_KEYS: Record<(typeof ENTITY_TYPES)[number], TranslationKey> = {
  PATIENT: 'patientsOption',
  PRODUCT: 'productsOption',
};

function CustomFieldsPanel() {
  const { t } = useI18n();
  const [entityType, setEntityType] = useState<(typeof ENTITY_TYPES)[number]>('PATIENT');
  const [defs, setDefs] = useState<CustomFieldDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>('TEXT');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setDefs(null);
    try {
      setDefs(await api<CustomFieldDefinition[]>(`/custom-fields/definitions?entityType=${entityType}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [entityType]);

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
          entityType,
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
      setError(e instanceof ApiError ? e.message : t('failedToCreateCustomField'));
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
      <div className="page-head row">
        <h2 style={{ margin: 0 }}>{t('customFieldsHeading')}</h2>
        <select value={entityType} onChange={(e) => setEntityType(e.target.value as typeof entityType)}>
          {ENTITY_TYPES.map((et) => (
            <option key={et} value={et}>
              {t(ENTITY_LABEL_KEYS[et])}
            </option>
          ))}
        </select>
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        {t('customFieldsDesc', { entity: t(ENTITY_LABEL_KEYS[entityType]).toLowerCase() })}
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('colKey')}</th>
              <th>{t('colLabel')}</th>
              <th>{t('typeLabel')}</th>
              <th>{t('colRequired')}</th>
              <th>{t('colStatus')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(!defs || defs.length === 0) && (
              <tr>
                <td colSpan={6} className="muted">
                  {defs ? t('noCustomFieldsYet') : t('loading')}
                </td>
              </tr>
            )}
            {defs?.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.key}</td>
                <td>{d.label}</td>
                <td>{d.fieldType}</td>
                <td>{d.required ? t('yesValue') : t('noValue')}</td>
                <td>
                  <span className={`badge ${d.active ? 'badge-ok' : 'badge-muted'}`}>{d.active ? t('activeBadge') : t('inactiveBadge')}</span>
                </td>
                <td>
                  <button className="btn btn-ghost" onClick={() => toggleActive(d)}>
                    {d.active ? t('deactivateButton') : t('activateButton')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <label className="field">
          {t('keyLabel')}
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={t('keyPlaceholder')} />
        </label>
        <label className="field">
          {t('labelLabel')}
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('labelPlaceholder')} />
        </label>
        <label className="field">
          {t('typeLabel')}
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value as typeof fieldType)}>
            {FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {ft}
              </option>
            ))}
          </select>
        </label>
        {fieldType === 'SELECT' && (
          <label className="field">
            {t('optionsCommaSeparatedLabel')}
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t('optionsPlaceholder')} />
          </label>
        )}
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          {t('requiredUiHintOnlyLabel')}
        </label>
        <button className="btn btn-primary" onClick={create} disabled={!valid || busy}>
          {!busy && <Plus size={16} />}
          {busy ? t('addingEllipsis') : t('addFieldButton')}
        </button>
      </div>
    </section>
  );
}
