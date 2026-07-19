import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';

// --- Types (inline; do not import from lib/types) ------------------------
type NotificationChannel = 'SMS' | 'EMAIL' | 'PUSH' | 'IN_APP';
type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

interface NotificationRow {
  id: string;
  pharmacyId: string | null;
  patientId: string | null;
  channel: NotificationChannel;
  type: string;
  subject: string | null;
  message: string;
  status: NotificationStatus;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
}

interface GenerateResult {
  created: number;
}

interface DispatchResult {
  attempted: number;
  sent: number;
  failed: number;
  provider: string;
}

interface OwnerLocation {
  id: string;
  name: string;
  province: string;
}

// --- Helpers -------------------------------------------------------------
const fmtDate = (s: string) => new Date(s).toLocaleString('en-CA');

const statusBadge = (s: NotificationStatus) =>
  s === 'SENT' ? 'badge-ok' : s === 'FAILED' ? 'badge-danger' : 'badge-warn';

export function Notifications() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const manage = can('notification:manage');

  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'generate' | 'dispatch' | null>(null);

  // Owner: load locations for the picker.
  useEffect(() => {
    if (!isOwner) return;
    api<{ locations: OwnerLocation[] }>('/dashboard/owner')
      .then((d) => setLocations(d.locations))
      .catch(() => {});
  }, [isOwner]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = isOwner && pharmacyId ? `?pharmacyId=${encodeURIComponent(pharmacyId)}` : '';
      setRows(await api<NotificationRow[]>(`/notifications${q}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isOwner, pharmacyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const body = () => JSON.stringify(isOwner && pharmacyId ? { pharmacyId } : {});

  const generate = async () => {
    setBusy('generate');
    setError(null);
    setNotice(null);
    try {
      const res = await api<GenerateResult>('/notifications/refill-reminders/generate', {
        method: 'POST',
        body: body(),
      });
      setNotice(t('refillRemindersGeneratedNotice', { count: res.created }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const dispatch = async () => {
    setBusy('dispatch');
    setError(null);
    setNotice(null);
    try {
      const res = await api<DispatchResult>('/notifications/dispatch', {
        method: 'POST',
        body: body(),
      });
      setNotice(
        t('dispatchedNotice', {
          sent: res.sent,
          attempted: res.attempted,
          failed: res.failed,
          provider: res.provider,
        }),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => r.status === 'PENDING').length;
    const sent = rows.filter((r) => r.status === 'SENT').length;
    const failed = rows.filter((r) => r.status === 'FAILED').length;
    return { total, pending, sent, failed };
  }, [rows]);

  const ownerNeedsLocation = isOwner && !pharmacyId;

  return (
    <div>
      <header className="page-head row">
        <div>
          <h1>{t('notificationsHeading')}</h1>
          <p className="muted">{t('notificationsSubtitle')}</p>
        </div>
        {isOwner && (
          <label className="field">
            {t('locationLabel')}
            <select
              className="select"
              value={pharmacyId}
              onChange={(e) => setPharmacyId(e.target.value)}
            >
              <option value="">{t('selectLocationPlaceholder')}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.province})
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">{t('statTotalInQueue')}</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statPending')}</div>
          <div className="stat-value" style={{ color: 'var(--warn)' }}>
            {stats.pending}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statSent')}</div>
          <div className="stat-value" style={{ color: 'var(--ok)' }}>
            {stats.sent}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('statFailed')}</div>
          <div
            className="stat-value"
            style={{ color: stats.failed > 0 ? 'var(--danger)' : undefined }}
          >
            {stats.failed}
          </div>
        </div>
      </div>

      {manage && (
        <section className="panel">
          <h2>{t('actionsHeading')}</h2>
          {ownerNeedsLocation && (
            <p className="muted">{t('selectLocationToGenerateOrDispatch')}</p>
          )}
          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={generate}
              disabled={busy !== null || ownerNeedsLocation}
            >
              {busy === 'generate' ? t('generatingEllipsis') : t('generateRefillRemindersButton')}
            </button>
            <button
              className="btn"
              onClick={dispatch}
              disabled={busy !== null || ownerNeedsLocation}
            >
              {busy === 'dispatch' ? t('dispatchingEllipsis') : t('dispatchPendingButton')}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>{t('queueHeading')}</h2>
        {loading ? (
          <div className="muted">{t('loading')}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colChannel')}</th>
                  <th>{t('colRecipient')}</th>
                  <th>{t('colSubjectMessage')}</th>
                  <th>{t('colStatus')}</th>
                  <th>{t('colCreated')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {t('noNotificationsInQueue')}
                    </td>
                  </tr>
                )}
                {rows.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <span className="badge badge-muted">{n.channel}</span>
                    </td>
                    <td className="mono">{n.patientId ?? '—'}</td>
                    <td>
                      {n.subject && <div>{n.subject}</div>}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {n.message.length > 90 ? `${n.message.slice(0, 90)}…` : n.message}
                      </div>
                      {n.error && (
                        <div style={{ color: 'var(--danger)', fontSize: 12 }}>{n.error}</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${statusBadge(n.status)}`}>{n.status}</span>
                    </td>
                    <td>{fmtDate(n.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
