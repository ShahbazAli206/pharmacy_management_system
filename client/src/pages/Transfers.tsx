import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';

interface PharmacyOpt {
  id: string;
  name: string;
  code: string;
  province: string;
}

interface ProductHit {
  id: string;
  name: string;
  strength: string;
  din: string;
}

interface TransferRow {
  id: string;
  quantity: number;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  createdAt: string;
  product: { id: string; name: string; din: string; strength: string; isControlled: boolean };
  fromPharmacy: { id: string; name: string; code: string };
  toPharmacy: { id: string; name: string; code: string };
  requestedBy: { firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
}

const STATUS_BADGE: Record<TransferRow['status'], string> = {
  REQUESTED: 'badge-warn',
  APPROVED: 'badge-ok',
  REJECTED: 'badge-danger',
  CANCELLED: 'badge-muted',
};

const fmtDate = (s: string) => new Date(s).toLocaleString('en-CA');

export function Transfers() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const canRequest = can('inventory:write');
  const canApprove = can('pharmacy:manage');

  const [locations, setLocations] = useState<PharmacyOpt[]>([]);
  const [rows, setRows] = useState<TransferRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<TransferRow[]>('/transfers'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    api<PharmacyOpt[]>('/pharmacies').then(setLocations).catch(() => {});
    void load();
  }, [load]);

  const NOTICE_BY_ACTION = {
    approve: t('transferApprovedNotice'),
    reject: t('transferRejectedNotice'),
    cancel: t('transferCancelledNotice'),
  } as const;
  const FAILED_BY_ACTION = {
    approve: t('failedToApproveTransfer'),
    reject: t('failedToRejectTransfer'),
    cancel: t('failedToCancelTransfer'),
  } as const;

  const decide = async (id: string, action: 'approve' | 'reject' | 'cancel') => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api(`/transfers/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      setNotice(NOTICE_BY_ACTION[action]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : FAILED_BY_ACTION[action]);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>{t('navTransfers')}</h1>
        <p className="muted">{t('stockTransfersSubtitle')}</p>
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {canRequest && (
        <RequestForm
          isOwner={isOwner}
          ownLocation={user?.pharmacy ? { id: user.pharmacy.id, name: user.pharmacy.name } : null}
          locations={locations}
          onError={setError}
          onCreated={(m) => {
            setNotice(m);
            void load();
          }}
        />
      )}

      <section className="panel">
        <div className="page-head row">
          <h2 style={{ margin: 0 }}>{t('navTransfers')}</h2>
          <button className="btn btn-ghost" onClick={() => void load()}>
            {t('refreshButton')}
          </button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colProduct')}</th>
                <th>{t('colRoute')}</th>
                <th className="num">{t('colQty')}</th>
                <th>{t('colStatus')}</th>
                <th>{t('colRequestedBy')}</th>
                <th>{t('colDate')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!rows && (
                <tr>
                  <td colSpan={7} className="muted">
                    {t('loadingTransfers')}
                  </td>
                </tr>
              )}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {t('noTransfersYet')}
                  </td>
                </tr>
              )}
              {rows?.map((row) => {
                const mine = row.requestedBy != null; // requester actions handled below
                return (
                  <tr key={row.id}>
                    <td>
                      {row.product.name} {row.product.strength}
                      {row.product.isControlled && (
                        <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                          {t('controlledBadge')}
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {row.fromPharmacy.code} → {row.toPharmacy.code}
                    </td>
                    <td className="num">{row.quantity}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[row.status]}`}>{row.status}</span>
                    </td>
                    <td>
                      {row.requestedBy ? `${row.requestedBy.firstName} ${row.requestedBy.lastName}` : '—'}
                      {row.approvedBy && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {t('byPrefix')} {row.approvedBy.firstName} {row.approvedBy.lastName}
                        </div>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {fmtDate(row.createdAt)}
                    </td>
                    <td>
                      {row.status === 'REQUESTED' && (
                        <span style={{ display: 'flex', gap: 6 }}>
                          {canApprove && (
                            <>
                              <button
                                className="btn btn-primary"
                                disabled={busyId === row.id}
                                onClick={() => decide(row.id, 'approve')}
                              >
                                {t('approveButton')}
                              </button>
                              <button
                                className="btn"
                                disabled={busyId === row.id}
                                onClick={() => decide(row.id, 'reject')}
                              >
                                {t('rejectButton')}
                              </button>
                            </>
                          )}
                          {!canApprove && canRequest && mine && (
                            <button
                              className="btn"
                              disabled={busyId === row.id}
                              onClick={() => decide(row.id, 'cancel')}
                            >
                              {t('cancel')}
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RequestForm({
  isOwner,
  ownLocation,
  locations,
  onError,
  onCreated,
}: {
  isOwner: boolean;
  ownLocation: { id: string; name: string } | null;
  locations: PharmacyOpt[];
  onError: (m: string | null) => void;
  onCreated: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceId = isOwner ? fromId : ownLocation?.id ?? '';

  // Debounced product search.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = search.trim();
    if (!q || product) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(() => {
      api<{ items: ProductHit[] }>(`/products?search=${encodeURIComponent(q)}&pageSize=6`)
        .then((r) => setHits(r.items))
        .catch(() => setHits([]));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [search, product]);

  const destinations = useMemo(
    () => locations.filter((l) => l.id !== sourceId),
    [locations, sourceId],
  );

  const valid = sourceId && toId && sourceId !== toId && product && quantity > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      await api('/transfers', {
        method: 'POST',
        body: JSON.stringify({
          ...(isOwner ? { fromPharmacyId: sourceId } : {}),
          toPharmacyId: toId,
          productId: product!.id,
          quantity,
          reason: reason.trim() || undefined,
        }),
      });
      setProduct(null);
      setSearch('');
      setQuantity(1);
      setReason('');
      setToId('');
      onCreated(t('transferRequestedNotice'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToRequestTransfer'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('requestTransferHeading')}</h2>
      <div className="form-grid">
        <label className="field">
          {t('fromLabel')}
          {isOwner ? (
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">{t('selectSourceOption')}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          ) : (
            <input value={ownLocation?.name ?? t('yourLocationPlaceholder')} disabled />
          )}
        </label>

        <label className="field">
          {t('toLabel')}
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">{t('selectDestinationOption')}</option>
            {destinations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          {t('colProduct')}
          {product ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>
                {product.name} {product.strength}
              </span>
              <button className="btn btn-ghost" style={{ width: 'auto', marginTop: 0 }} onClick={() => setProduct(null)}>
                {t('changeButton')}
              </button>
            </div>
          ) : (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchNameOrDinPlaceholder')}
            />
          )}
        </label>

        <label className="field">
          {t('colQty')}
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <label className="field">
          {t('reasonOptionalLabel')}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rebalance stock" />
        </label>

        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? t('requestingEllipsis') : t('requestTransferButton')}
        </button>
      </div>

      {!product && hits.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <tbody>
              {hits.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name} {p.strength}{' '}
                    <span className="muted mono" style={{ fontSize: 12 }}>
                      DIN {p.din}
                    </span>
                  </td>
                  <td style={{ width: 1 }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setProduct(p);
                        setHits([]);
                        setSearch('');
                      }}
                    >
                      {t('selectButton')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
