import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';

type RecallRisk = 'TYPE_I' | 'TYPE_II' | 'TYPE_III';
type QuarantineStatus = 'QUARANTINED' | 'CLEARED' | 'DESTROYED';

interface RecallRow {
  id: string;
  source: string;
  recallNumber: string;
  din: string | null;
  productName: string;
  reason: string;
  risk: RecallRisk;
  publishedAt: string;
  createdAt: string;
}

interface QuarantineRow {
  id: string;
  pharmacyId: string;
  recallId: string;
  productId: string;
  status: QuarantineStatus;
  quantityAffected: number;
  notes: string | null;
  clearedAt: string | null;
  createdAt: string;
  recall: { recallNumber: string; productName: string; risk: RecallRisk };
  product: { name: string; din: string | null };
  pharmacy: { name: string; code: string };
}

interface IngestResult {
  recall: RecallRow;
  locationsAffected: number;
}

interface OwnerLocation {
  id: string;
  name: string;
  province: string;
}

type Tab = 'recalls' | 'quarantines';

const fmtDate = (s: string) => new Date(s).toLocaleString('en-CA');

const RISK_LABEL: Record<RecallRisk, string> = {
  TYPE_I: 'Type I',
  TYPE_II: 'Type II',
  TYPE_III: 'Type III',
};

function riskBadge(risk: RecallRisk): string {
  if (risk === 'TYPE_I') return 'badge-danger';
  if (risk === 'TYPE_II') return 'badge-warn';
  return 'badge-muted';
}

function statusBadge(status: QuarantineStatus): string {
  if (status === 'QUARANTINED') return 'badge-warn';
  if (status === 'CLEARED') return 'badge-ok';
  return 'badge-danger';
}

export function Recalls() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('recalls');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div>
      <header className="page-head">
        <h1>{t('navRecalls')}</h1>
        <p className="muted">{t('recallsSubtitle')}</p>
      </header>

      <div className="tabs">
        <button
          className={`tab ${tab === 'recalls' ? 'active' : ''}`}
          onClick={() => {
            setTab('recalls');
            setError(null);
            setNotice(null);
          }}
        >
          {t('navRecalls')}
        </button>
        <button
          className={`tab ${tab === 'quarantines' ? 'active' : ''}`}
          onClick={() => {
            setTab('quarantines');
            setError(null);
            setNotice(null);
          }}
        >
          {t('quarantinesTab')}
        </button>
      </div>

      {notice && <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {tab === 'recalls' && <RecallsTab onError={setError} onNotice={setNotice} />}
      {tab === 'quarantines' && <QuarantinesTab onError={setError} onNotice={setNotice} />}
    </div>
  );
}

function RecallsTab({
  onError,
  onNotice,
}: {
  onError: (m: string | null) => void;
  onNotice: (m: string | null) => void;
}) {
  const { can } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<RecallRow[] | null>(null);
  const [recallNumber, setRecallNumber] = useState('');
  const [productName, setProductName] = useState('');
  const [din, setDin] = useState('');
  const [reason, setReason] = useState('');
  const [risk, setRisk] = useState<RecallRisk>('TYPE_I');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<RecallRow[]>('/recalls'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToLoadRecalls'));
    }
  }, [onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const ingest = async () => {
    if (!recallNumber.trim() || !productName.trim() || !reason.trim()) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const res = await api<IngestResult>('/recalls/ingest', {
        method: 'POST',
        body: JSON.stringify({
          recallNumber: recallNumber.trim(),
          productName: productName.trim(),
          din: din.trim() || undefined,
          reason: reason.trim(),
          risk,
        }),
      });
      onNotice(t('recallIngestedNotice', { number: res.recall.recallNumber, count: res.locationsAffected }));
      setRecallNumber('');
      setProductName('');
      setDin('');
      setReason('');
      setRisk('TYPE_I');
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('ingestFailedFallback'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {can('recall:manage') && (
        <section className="panel">
          <h2>{t('ingestRecallHeading')}</h2>
          <div className="form-grid">
            <label className="field">
              {t('recallNumberLabel')}
              <input
                value={recallNumber}
                onChange={(e) => setRecallNumber(e.target.value)}
                placeholder="RA-12345"
              />
            </label>
            <label className="field">
              {t('productNameLabel')}
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Amoxicillin 500mg"
              />
            </label>
            <label className="field">
              {t('colDin')}
              <input value={din} onChange={(e) => setDin(e.target.value)} placeholder="02240000" />
            </label>
            <label className="field">
              {t('riskLabel')}
              <select value={risk} onChange={(e) => setRisk(e.target.value as RecallRisk)}>
                <option value="TYPE_I">{t('riskTypeIOption')}</option>
                <option value="TYPE_II">Type II</option>
                <option value="TYPE_III">Type III</option>
              </select>
            </label>
            <label className="field">
              {t('reasonLabel')}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contamination risk"
              />
            </label>
            <button
              className="btn btn-primary"
              onClick={ingest}
              disabled={busy || !recallNumber.trim() || !productName.trim() || !reason.trim()}
            >
              {busy ? t('ingestingEllipsis') : t('ingestRecallButton')}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>{t('navRecalls')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colRecallNum')}</th>
                <th>{t('colProduct')}</th>
                <th>{t('colDin')}</th>
                <th>{t('riskLabel')}</th>
                <th>{t('reasonLabel')}</th>
                <th>{t('colPublished')}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={6} className="muted">
                    {t('loading')}
                  </td>
                </tr>
              )}
              {rows !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {t('noRecallsRecorded')}
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.recallNumber}</td>
                  <td>{r.productName}</td>
                  <td className="mono">{r.din ?? '—'}</td>
                  <td>
                    <span className={`badge ${riskBadge(r.risk)}`}>{RISK_LABEL[r.risk]}</span>
                  </td>
                  <td>{r.reason}</td>
                  <td>{fmtDate(r.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function QuarantinesTab({
  onError,
  onNotice,
}: {
  onError: (m: string | null) => void;
  onNotice: (m: string | null) => void;
}) {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [rows, setRows] = useState<QuarantineRow[] | null>(null);
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    api<{ locations: OwnerLocation[] }>('/dashboard/owner')
      .then((d) => setLocations(d.locations))
      .catch(() => {});
  }, [isOwner]);

  const load = useCallback(async () => {
    // Owner must pick a location before the quarantine list is scoped.
    if (isOwner && !pharmacyId) {
      setRows([]);
      return;
    }
    try {
      const query = isOwner && pharmacyId ? `?pharmacyId=${encodeURIComponent(pharmacyId)}` : '';
      setRows(await api<QuarantineRow[]>(`/recalls/quarantines${query}`));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToLoadQuarantines'));
    }
  }, [isOwner, pharmacyId, onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: 'CLEARED' | 'DESTROYED') => {
    setBusyId(id);
    onError(null);
    onNotice(null);
    try {
      await api(`/recalls/quarantines/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      onNotice(status === 'CLEARED' ? t('quarantineClearedNotice') : t('stockDestroyedNotice'));
      await load();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('updateFailedFallback'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel">
      <h2>{t('quarantinesTab')}</h2>
      {isOwner && (
        <div className="toolbar">
          <label className="field">
            {t('locationLabel')}
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              <option value="">{t('selectLocationPlaceholder')}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.province})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {isOwner && !pharmacyId ? (
        <div className="muted">{t('selectLocationToViewQuarantines')}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colProduct')}</th>
                <th>{t('colDin')}</th>
                <th>{t('colRecallNum')}</th>
                <th>{t('locationLabel')}</th>
                <th className="num">{t('colQuantity')}</th>
                <th>{t('colStatus')}</th>
                {can('recall:manage') && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={can('recall:manage') ? 7 : 6} className="muted">
                    {t('loading')}
                  </td>
                </tr>
              )}
              {rows !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={can('recall:manage') ? 7 : 6} className="muted">
                    {t('noQuarantineRecords')}
                  </td>
                </tr>
              )}
              {rows?.map((q) => (
                <tr key={q.id}>
                  <td>{q.product.name}</td>
                  <td className="mono">{q.product.din ?? '—'}</td>
                  <td className="mono">{q.recall.recallNumber}</td>
                  <td>
                    {q.pharmacy.name}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {q.pharmacy.code}
                    </div>
                  </td>
                  <td className="num">{q.quantityAffected}</td>
                  <td>
                    <span className={`badge ${statusBadge(q.status)}`}>{q.status}</span>
                  </td>
                  {can('recall:manage') && (
                    <td>
                      {q.status === 'QUARANTINED' && (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-primary"
                            disabled={busyId === q.id}
                            onClick={() => setStatus(q.id, 'CLEARED')}
                          >
                            {busyId === q.id ? t('workingEllipsis') : t('clearButton')}
                          </button>
                          <button
                            className="btn btn-ghost"
                            disabled={busyId === q.id}
                            onClick={() => setStatus(q.id, 'DESTROYED')}
                          >
                            {t('destroyButton')}
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
