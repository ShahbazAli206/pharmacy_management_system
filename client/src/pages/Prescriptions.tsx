import { useCallback, useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import { useOnlineStatus } from '../lib/offline/useOnlineStatus';
import {
  cachePrescriptions,
  getCachedPrescriptions,
  getPendingDispenses,
  queueDispense,
  type PendingDispense,
} from '../lib/offline/offlineDispense';
import type { PrescriptionRow } from '../lib/types';

export function Prescriptions() {
  const { can } = useAuth();
  const { t } = useI18n();
  const { online, syncing, lastSync } = useOnlineStatus();
  const [rows, setRows] = useState<PrescriptionRow[] | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [pending, setPending] = useState<PendingDispense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    setPending(await getPendingDispenses());
  }, []);

  const load = useCallback(async () => {
    try {
      const live = await api<PrescriptionRow[]>('/prescriptions');
      setRows(live);
      setFromCache(false);
      void cachePrescriptions(live);
    } catch (e) {
      // Offline (or the API is genuinely down) — fall back to the last
      // successful snapshot so the pharmacist can still see the list and
      // queue dispenses (spec §13.2: "local cache allows ... dispensing").
      const cached = await getCachedPrescriptions();
      if (cached.length > 0) {
        setRows(cached);
        setFromCache(true);
      } else {
        setError(e instanceof ApiError ? e.message : t('loadingPrescriptions'));
      }
    }
    await refreshPending();
  }, [refreshPending, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Once a sync completes (triggered by useOnlineStatus on reconnect), the
  // pending queue and the real list have both changed — refresh both.
  useEffect(() => {
    if (lastSync) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSync]);

  const dispense = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      if (!online) {
        await queueDispense(id, {});
        setNotice(t('dispenseQueuedOfflineNotice'));
        await load();
        return;
      }
      const res = await api<{ refillsRemaining: number }>(`/prescriptions/${id}/dispense`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(t('dispensedNotice', { count: res.refillsRemaining }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('dispenseFailedFallback'));
    } finally {
      setBusyId(null);
    }
  };

  if (error && !rows) return <div className="alert alert-error">{error}</div>;
  if (!rows) return <div className="muted">{t('loadingPrescriptions')}</div>;

  const fillsRemaining = (r: PrescriptionRow) => 1 + r.refillsAuthorized - r.refillsUsed;
  const isPendingSync = (id: string) => pending.some((p) => p.prescriptionId === id);

  return (
    <div>
      <header className="page-head">
        <h1>{t('navPrescriptions')}</h1>
        <p className="muted">{t('recordsCount', { count: rows.length })}</p>
      </header>

      {!online && (
        <div className="alert" style={{ background: '#fef3c7', color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
          <WifiOff size={16} />
          {fromCache ? t('offlineUsingCachedDataNotice') : t('offlineNotice')}
        </div>
      )}
      {syncing && <div className="alert">{t('syncingPendingDispensesNotice')}</div>}
      {pending.length > 0 && online && !syncing && (
        <div className="alert" style={{ background: '#fef3c7', color: '#92400e' }}>
          {t('pendingSyncCountNotice', { count: pending.length })}
        </div>
      )}
      {lastSync && lastSync.synced > 0 && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {t('syncCompleteNotice', { count: lastSync.synced })}
        </div>
      )}

      {notice && <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colPatient')}</th>
                <th>{t('colDrug')}</th>
                <th>{t('colPrescriberSingular')}</th>
                <th className="num">{t('colFillsLeft')}</th>
                <th>{t('colStatus')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {t('noPrescriptionsYet')}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.patient.lastName}, {r.patient.firstName}
                  </td>
                  <td>
                    {r.drugName} {r.strength}
                    {r.isControlled && (
                      <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', marginLeft: 6 }}>
                        {t('controlledBadge')}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.prescriber.firstName} {r.prescriber.lastName}
                  </td>
                  <td className="num">{fillsRemaining(r)}</td>
                  <td>
                    <span className={`badge ${r.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>
                      {r.status}
                    </span>
                    {isPendingSync(r.id) && (
                      <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                        {t('queuedBadge')}
                      </span>
                    )}
                  </td>
                  <td>
                    {can('prescription:dispense') && r.status === 'ACTIVE' && fillsRemaining(r) > 0 && (
                      <button
                        className="btn btn-primary"
                        disabled={busyId === r.id}
                        onClick={() => dispense(r.id)}
                      >
                        {busyId === r.id ? t('dispensingEllipsis') : t('dispenseButton')}
                      </button>
                    )}
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
