import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import type { TranslationKey } from '../lib/i18n/translations';
import { fetchLocations, type LocationOption } from '../lib/locations';
import type { WorkflowRow } from '../lib/types';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const STATUS_LOWER_KEYS: Record<string, TranslationKey> = {
  PENDING: 'workflowStatusPendingLower',
  APPROVED: 'workflowStatusApprovedLower',
  REJECTED: 'workflowStatusRejectedLower',
};

export function Workflow() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ entityType: '', entityId: '', action: '', reason: '' });
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api<WorkflowRow[]>(`/workflow?status=${status}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isOwner) fetchLocations().then(setLocations).catch(() => {});
  }, [isOwner]);

  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setError(null);
    try {
      await api(`/workflow/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const raise = async () => {
    if (!form.entityType.trim() || !form.entityId.trim() || !form.action.trim()) return;
    if (isOwner && !pharmacyId) {
      setError(t('selectLocationForRequest'));
      return;
    }
    setError(null);
    try {
      await api('/workflow', {
        method: 'POST',
        body: JSON.stringify({
          entityType: form.entityType.trim(),
          entityId: form.entityId.trim(),
          action: form.action.trim(),
          reason: form.reason || undefined,
          ...(isOwner ? { pharmacyId } : {}),
        }),
      });
      setForm({ entityType: '', entityId: '', action: '', reason: '' });
      setStatus('PENDING');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const badge = (s: string) => (s === 'APPROVED' ? 'badge-ok' : s === 'REJECTED' ? 'badge-danger' : 'badge-warn');

  return (
    <div>
      <header className="page-head">
        <h1>{t('workflowHeading')}</h1>
        <p className="muted">{t('workflowSubtitle')}</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <h2>{t('raiseRequestHeading')}</h2>
        <div className="form-grid">
          {isOwner && (
            <label className="field">
              {t('locationLabel')}
              <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
                <option value="">{t('selectLocationPlaceholder')}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            {t('entityTypeLabel')}
            <input value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} placeholder="StockTransfer" />
          </label>
          <label className="field">
            {t('entityIdLabel')}
            <input value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} />
          </label>
          <label className="field">
            {t('actionLabel')}
            <input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="TRANSFER" />
          </label>
          <label className="field">
            {t('reasonLabel')}
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <button className="btn btn-primary" onClick={raise} disabled={!form.entityType.trim() || !form.entityId.trim() || !form.action.trim()}>
            {t('submitRequestButton')}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          {STATUSES.map((s) => (
            <button key={s} className={`btn ${status === s ? 'btn-primary' : ''}`} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colEntity')}</th>
                <th>{t('colAction')}</th>
                <th>{t('reasonLabel')}</th>
                <th>{t('colStatus')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {t('noRequestsOfStatus', { status: t(STATUS_LOWER_KEYS[status]) })}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.entityType}
                    <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {r.entityId}
                    </div>
                  </td>
                  <td>{r.action}</td>
                  <td>{r.reason ?? '—'}</td>
                  <td>
                    <span className={`badge ${badge(r.status)}`}>{r.status}</span>
                  </td>
                  <td>
                    {r.status === 'PENDING' &&
                      (r.requestedByUserId === user?.id ? (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {t('yourRequestLabel')}
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" onClick={() => decide(r.id, 'APPROVED')}>
                            {t('approveButton')}
                          </button>
                          <button className="btn" onClick={() => decide(r.id, 'REJECTED')}>
                            {t('rejectButton')}
                          </button>
                        </span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
