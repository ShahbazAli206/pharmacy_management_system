import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

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

  const decide = async (id: string, action: 'approve' | 'reject' | 'cancel') => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api(`/transfers/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      setNotice(`Transfer ${action === 'approve' ? 'approved — stock moved' : action + 'ed'}.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Failed to ${action} transfer`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>Stock Transfers</h1>
        <p className="muted">Inter-pharmacy stock movement — request, owner approval, FEFO transfer</p>
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
          <h2 style={{ margin: 0 }}>Transfers</h2>
          <button className="btn btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Route</th>
                <th className="num">Qty</th>
                <th>Status</th>
                <th>Requested by</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!rows && (
                <tr>
                  <td colSpan={7} className="muted">
                    Loading transfers…
                  </td>
                </tr>
              )}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No transfers yet.
                  </td>
                </tr>
              )}
              {rows?.map((t) => {
                const mine = t.requestedBy != null; // requester actions handled below
                return (
                  <tr key={t.id}>
                    <td>
                      {t.product.name} {t.product.strength}
                      {t.product.isControlled && (
                        <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                          Controlled
                        </span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {t.fromPharmacy.code} → {t.toPharmacy.code}
                    </td>
                    <td className="num">{t.quantity}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                    </td>
                    <td>
                      {t.requestedBy ? `${t.requestedBy.firstName} ${t.requestedBy.lastName}` : '—'}
                      {t.approvedBy && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          by {t.approvedBy.firstName} {t.approvedBy.lastName}
                        </div>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {fmtDate(t.createdAt)}
                    </td>
                    <td>
                      {t.status === 'REQUESTED' && (
                        <span style={{ display: 'flex', gap: 6 }}>
                          {canApprove && (
                            <>
                              <button
                                className="btn btn-primary"
                                disabled={busyId === t.id}
                                onClick={() => decide(t.id, 'approve')}
                              >
                                Approve
                              </button>
                              <button
                                className="btn"
                                disabled={busyId === t.id}
                                onClick={() => decide(t.id, 'reject')}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {!canApprove && canRequest && mine && (
                            <button
                              className="btn"
                              disabled={busyId === t.id}
                              onClick={() => decide(t.id, 'cancel')}
                            >
                              Cancel
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
      onCreated('Transfer requested — awaiting owner approval.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to request transfer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Request a transfer</h2>
      <div className="form-grid">
        <label className="field">
          From
          {isOwner ? (
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Select source…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          ) : (
            <input value={ownLocation?.name ?? 'Your location'} disabled />
          )}
        </label>

        <label className="field">
          To
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Select destination…</option>
            {destinations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Product
          {product ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>
                {product.name} {product.strength}
              </span>
              <button className="btn btn-ghost" style={{ width: 'auto', marginTop: 0 }} onClick={() => setProduct(null)}>
                change
              </button>
            </div>
          ) : (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or DIN…"
            />
          )}
        </label>

        <label className="field">
          Quantity
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <label className="field">
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rebalance stock" />
        </label>

        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? 'Requesting…' : 'Request transfer'}
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
                      Select
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
