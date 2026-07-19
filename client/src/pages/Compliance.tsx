import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import { fetchLocations, type LocationOption } from '../lib/locations';
import type { ChecklistItem, ComplianceAlert, ComplianceScore, LicenseWarnings } from '../lib/types';

export function Compliance() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [score, setScore] = useState<ComplianceScore | null>(null);
  const [licenses, setLicenses] = useState<LicenseWarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    fetchLocations()
      .then((opts) => {
        setLocations(opts);
        if (opts[0]) setPharmacyId(opts[0].id);
      })
      .catch(() => {});
  }, [isOwner]);

  const ready = !isOwner || !!pharmacyId;

  const load = useCallback(async () => {
    if (!ready) return;
    const q = isOwner && pharmacyId ? `?pharmacyId=${pharmacyId}` : '';
    try {
      const [c, a, s, l] = await Promise.all([
        api<ChecklistItem[]>(`/compliance/checklist${q}`),
        api<ComplianceAlert[]>(`/compliance/alerts${q}`),
        api<ComplianceScore>(`/compliance/score${q}`),
        api<LicenseWarnings>(`/compliance/license-expiry${q}`),
      ]);
      setChecklist(c);
      setAlerts(a);
      setScore(s);
      setLicenses(l);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [isOwner, pharmacyId, ready]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      await api('/compliance/checklist/generate', {
        method: 'POST',
        body: JSON.stringify(isOwner && pharmacyId ? { pharmacyId } : {}),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const complete = async (item: ChecklistItem) => {
    const signature = item.template.requiresSignature
      ? window.prompt(t('signaturePromptText')) ?? ''
      : undefined;
    if (item.template.requiresSignature && !signature) return;
    await api(`/compliance/checklist/${item.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ signature }),
    });
    await load();
  };

  const resolve = async (id: string) => {
    await api(`/compliance/alerts/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) });
    await load();
  };

  if (isOwner && !ready) return <div className="alert">{t('selectLocationPlaceholder')}</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const bandColor: Record<string, string> = { GREEN: 'var(--ok)', YELLOW: 'var(--warn)', RED: 'var(--danger)' };
  const licenseRows = [...(licenses?.licenses ?? []), ...(licenses?.permits ?? [])];

  return (
    <div>
      <header className="page-head row">
        <div>
          <h1>{t('navCompliance')}</h1>
          <p className="muted">{t('complianceSubtitle')}</p>
        </div>
        {can('compliance:write') && (
          <button className="btn" onClick={generate} disabled={busy}>
            {busy ? t('generatingEllipsis') : t('generateChecklistButton')}
          </button>
        )}
      </header>

      {isOwner && (
        <div className="toolbar">
          <label className="field" style={{ minWidth: 260 }}>
            {t('locationLabel')}
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              {locations.length === 0 && <option value="">{t('loading')}</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="stat-grid">
        {score && (
          <div className="stat-card">
            <div className="stat-label">{t('complianceScoreLabel')}</div>
            <div className="stat-value" style={{ color: bandColor[score.band] }}>
              {score.score}
            </div>
            <div className="stat-sub" style={{ color: bandColor[score.band] }}>
              {score.band} · {t('tasksCount', { completed: score.completed, total: score.total })}
            </div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">{t('openAlertsLabel')}</div>
          <div className="stat-value">{alerts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('licensePermitWarningsLabel')}</div>
          <div className="stat-value">{licenseRows.length}</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="panel">
          <h2>{t('alertsHeading')}</h2>
          {alerts.map((a) => (
            <div
              key={a.id}
              className="alert"
              style={{
                background: a.severity === 'CRITICAL' ? '#fef2f2' : '#fffbeb',
                color: a.severity === 'CRITICAL' ? '#991b1b' : '#92400e',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                <strong>{a.severity}</strong> · {a.message}
              </span>
              {can('compliance:write') && (
                <button className="btn" onClick={() => resolve(a.id)}>
                  {t('resolveButton')}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>{t('todaysChecklistHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colTask')}</th>
                <th>{t('colStatus')}</th>
                <th>{t('colCompletedBy')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {checklist.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {t('noChecklistYet')}
                  </td>
                </tr>
              )}
              {checklist.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.label}
                    {item.template.requiresSignature && (
                      <span className="badge badge-muted" style={{ marginLeft: 6 }}>
                        {t('signatureBadge')}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        item.status === 'COMPLETED' ? 'badge-ok' : item.status === 'OVERDUE' ? '' : 'badge-muted'
                      }`}
                      style={item.status === 'OVERDUE' ? { background: '#fee2e2', color: '#991b1b' } : undefined}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="muted">
                    {item.completedBy ? `${item.completedBy.firstName} ${item.completedBy.lastName}` : '—'}
                  </td>
                  <td>
                    {item.status !== 'COMPLETED' && can('compliance:write') && (
                      <button className="btn btn-primary" onClick={() => complete(item)}>
                        {t('completeButton')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {licenseRows.length > 0 && (
        <section className="panel">
          <h2>{t('licensePermitExpiryHeading')}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colType')}</th>
                  <th>{t('colName')}</th>
                  <th>{t('colExpiry')}</th>
                  <th className="num">{t('colDaysLeft')}</th>
                </tr>
              </thead>
              <tbody>
                {licenseRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.kind.replace('_', ' ')}</td>
                    <td>{r.name}</td>
                    <td>{new Date(r.expiry).toLocaleDateString('en-CA')}</td>
                    <td className="num">{r.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
