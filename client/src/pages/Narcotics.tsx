import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

// ---- Inline types (do not import from lib/types) -------------------------

interface OwnerLocation {
  id: string;
  name: string;
  province: string;
}

interface ProductItem {
  id: string;
  name: string;
  strength: string;
  din: string;
  isControlled: boolean;
  schedule: string;
}

interface RegisterTxn {
  id: string;
  productId: string;
  type: string;
  quantityChange: number;
  balanceAfter: number;
  notes: string | null;
  createdAt: string;
  product: { name: string; din: string; strength: string };
  performedBy: { firstName: string; lastName: string } | null;
}

interface CountResult {
  id: string;
  productId: string;
  period: string;
  countedQuantity: number;
  expectedQuantity: number;
  discrepancy: number;
  status: string;
  createdAt: string;
}

// ---- Constants -----------------------------------------------------------

const TXN_TYPES = [
  'RECEIPT',
  'DISPENSE',
  'ADJUSTMENT',
  'COUNT_ADJUSTMENT',
  'DESTRUCTION',
  'TRANSFER',
] as const;
type TxnType = (typeof TXN_TYPES)[number];

const COUNT_PERIODS = ['MORNING', 'CLOSING', 'SPOT'] as const;
type CountPeriod = (typeof COUNT_PERIODS)[number];

const fmtDate = (s: string) => new Date(s).toLocaleString('en-CA');

// ---- Component -----------------------------------------------------------

export function Narcotics() {
  const { user, can } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const writable = can('narcotics:write');

  // Owner location picker
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');

  // Product picker
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProductItem | null>(null);

  // Register
  const [register, setRegister] = useState<RegisterTxn[] | null>(null);

  // Page-level status
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Owner needs a location selected before reads are scoped.
  const scopeReady = !isOwner || Boolean(pharmacyId);
  const scopeQuery = isOwner && pharmacyId ? `pharmacyId=${pharmacyId}` : '';

  // Load owner locations once.
  useEffect(() => {
    if (!isOwner) return;
    api<{ locations: OwnerLocation[] }>('/dashboard/owner')
      .then((res) => setLocations(res.locations))
      .catch((e) => setError((e as Error).message));
  }, [isOwner]);

  const loadRegister = useCallback(async () => {
    if (!scopeReady) {
      setRegister(null);
      return;
    }
    const params = [scopeQuery, selected ? `productId=${selected.id}` : '']
      .filter(Boolean)
      .join('&');
    try {
      const rows = await api<RegisterTxn[]>(`/narcotics/register${params ? `?${params}` : ''}`);
      setRegister(rows);
    } catch (e) {
      setError((e as Error).message);
      setRegister([]);
    }
  }, [scopeReady, scopeQuery, selected]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  // Product search (controlled substances only).
  const runSearch = async () => {
    if (!search.trim()) {
      setProducts([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await api<{ items: ProductItem[] }>(
        `/products?search=${encodeURIComponent(search.trim())}`,
      );
      setProducts(res.items.filter((p) => p.isControlled));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  // Running balance for the selected product = latest txn's balanceAfter.
  const runningBalance = register && register.length > 0 ? register[0].balanceAfter : 0;

  return (
    <div>
      <header className="page-head">
        <h1>Narcotics</h1>
        <p className="muted">
          Controlled-substance register — running balances, counts, and discrepancy resolution
        </p>
      </header>

      {isOwner && (
        <section className="panel">
          <label className="field">
            Location
            <select
              className="select"
              value={pharmacyId}
              onChange={(e) => {
                setPharmacyId(e.target.value);
                setSelected(null);
                setNotice(null);
                setError(null);
              }}
            >
              <option value="">Select a location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.province})
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {isOwner && !pharmacyId ? (
        <div className="muted">Select a location to view its controlled-substance register.</div>
      ) : (
        <>
          {/* Product picker */}
          <section className="panel">
            <h2>Controlled substance</h2>
            <div className="toolbar">
              <input
                className="search"
                placeholder="Search controlled products (e.g. Lorazepam)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
              />
              <button className="btn" onClick={() => void runSearch()} disabled={searching}>
                {searching ? 'Searching…' : 'Search'}
              </button>
              {selected && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setSelected(null);
                    setProducts([]);
                    setSearch('');
                  }}
                >
                  Clear selection
                </button>
              )}
            </div>

            {selected ? (
              <div style={{ marginTop: 12 }}>
                <span className="badge badge-warn">Selected</span>{' '}
                <strong>{selected.name}</strong>{' '}
                <span className="muted">
                  {selected.strength} · DIN <span className="mono">{selected.din}</span> ·{' '}
                  {selected.schedule}
                </span>
              </div>
            ) : (
              products.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Strength</th>
                        <th>DIN</th>
                        <th>Schedule</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{p.strength}</td>
                          <td className="mono">{p.din}</td>
                          <td>
                            <span className="badge badge-muted">{p.schedule}</span>
                          </td>
                          <td>
                            <button className="btn btn-primary" onClick={() => setSelected(p)}>
                              Select
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
            {!selected && !searching && search.trim() && products.length === 0 && (
              <div className="muted" style={{ marginTop: 12 }}>
                No controlled products match “{search.trim()}”.
              </div>
            )}
          </section>

          {/* Selected product running balance */}
          {selected && (
            <section className="panel">
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-label">Running balance</div>
                  <div className="stat-value">{runningBalance}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Ledger entries</div>
                  <div className="stat-value">{register ? register.length : 0}</div>
                </div>
              </div>
            </section>
          )}

          {/* Write forms */}
          {writable && selected && (
            <TxnForm
              product={selected}
              isOwner={isOwner}
              pharmacyId={pharmacyId}
              onDone={(msg) => {
                setNotice(msg);
                setError(null);
                void loadRegister();
              }}
              onError={(msg) => {
                setError(msg);
                setNotice(null);
              }}
            />
          )}

          {writable && selected && (
            <CountForm
              product={selected}
              isOwner={isOwner}
              pharmacyId={pharmacyId}
              onDone={(msg) => {
                setNotice(msg);
                setError(null);
                void loadRegister();
              }}
              onError={(msg) => {
                setError(msg);
                setNotice(null);
              }}
              onResolved={(msg) => {
                setNotice(msg);
                setError(null);
                void loadRegister();
              }}
            />
          )}

          {/* Register table */}
          <section className="panel">
            <h2>Register {selected ? `— ${selected.name}` : '(all controlled products)'}</h2>
            {register === null ? (
              <div className="muted">Loading register…</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Product</th>
                      <th>Type</th>
                      <th className="num">Change</th>
                      <th className="num">Balance</th>
                      <th>By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {register.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted">
                          No register entries yet.
                        </td>
                      </tr>
                    )}
                    {register.map((t) => (
                      <tr key={t.id}>
                        <td>{fmtDate(t.createdAt)}</td>
                        <td>
                          {t.product.name}{' '}
                          <span className="muted">{t.product.strength}</span>
                        </td>
                        <td>
                          <span className="badge badge-muted">{t.type}</span>
                        </td>
                        <td className="num">
                          {t.quantityChange > 0 ? `+${t.quantityChange}` : t.quantityChange}
                        </td>
                        <td className="num">{t.balanceAfter}</td>
                        <td>
                          {t.performedBy
                            ? `${t.performedBy.firstName} ${t.performedBy.lastName}`
                            : '—'}
                        </td>
                        <td className="muted">{t.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---- Record transaction form --------------------------------------------

function TxnForm({
  product,
  isOwner,
  pharmacyId,
  onDone,
  onError,
}: {
  product: ProductItem;
  isOwner: boolean;
  pharmacyId: string;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [type, setType] = useState<TxnType>('RECEIPT');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const qty = parseInt(quantity, 10);
    if (Number.isNaN(qty)) {
      onError('Quantity change must be a whole number.');
      return;
    }
    setBusy(true);
    try {
      await api('/narcotics/register', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          type,
          quantityChange: qty,
          notes: notes.trim() || undefined,
          ...(isOwner && pharmacyId ? { pharmacyId } : {}),
        }),
      });
      setQuantity('');
      setNotes('');
      onDone(`Recorded ${type} of ${qty} for ${product.name}.`);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to record transaction');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Record transaction</h2>
      <div className="form-grid">
        <label className="field">
          Type
          <select
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as TxnType)}
          >
            {TXN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Quantity change (may be negative)
          <input
            className="num"
            type="number"
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 30 or -1"
          />
        </label>
        <label className="field">
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </label>
        <button
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={busy || !quantity.trim()}
        >
          {busy ? 'Recording…' : 'Record transaction'}
        </button>
      </div>
    </section>
  );
}

// ---- Record count form ---------------------------------------------------

function CountForm({
  product,
  isOwner,
  pharmacyId,
  onDone,
  onError,
  onResolved,
}: {
  product: ProductItem;
  isOwner: boolean;
  pharmacyId: string;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
  onResolved: (msg: string) => void;
}) {
  const [period, setPeriod] = useState<CountPeriod>('MORNING');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const [resolving, setResolving] = useState(false);

  const submit = async () => {
    const qty = parseInt(counted, 10);
    if (Number.isNaN(qty) || qty < 0) {
      onError('Counted quantity must be a non-negative whole number.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await api<CountResult>('/narcotics/count', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          period,
          countedQuantity: qty,
          notes: notes.trim() || undefined,
          ...(isOwner && pharmacyId ? { pharmacyId } : {}),
        }),
      });
      setResult(res);
      setCounted('');
      setNotes('');
      if (res.discrepancy === 0) {
        onDone(`Count balanced for ${product.name} (${res.countedQuantity} on hand).`);
      } else {
        onError(
          `Discrepancy of ${res.discrepancy > 0 ? '+' : ''}${res.discrepancy} for ${product.name}. Product is locked until resolved.`,
        );
      }
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to record count');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    if (!result) return;
    setResolving(true);
    try {
      await api(`/narcotics/count/${result.id}/resolve`, { method: 'POST' });
      setResult(null);
      onResolved(`Discrepancy resolved for ${product.name}. Register reconciled and unlocked.`);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to resolve discrepancy');
    } finally {
      setResolving(false);
    }
  };

  const hasDiscrepancy = result !== null && result.discrepancy !== 0;

  return (
    <section className="panel">
      <h2>Record count</h2>
      <div className="form-grid">
        <label className="field">
          Period
          <select
            className="select"
            value={period}
            onChange={(e) => setPeriod(e.target.value as CountPeriod)}
          >
            {COUNT_PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Counted quantity
          <input
            className="num"
            type="number"
            step={1}
            min={0}
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="Physical count"
          />
        </label>
        <label className="field">
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </label>
        <button
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={busy || !counted.trim()}
        >
          {busy ? 'Recording…' : 'Record count'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Counted</div>
              <div className="stat-value">{result.countedQuantity}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Expected</div>
              <div className="stat-value">{result.expectedQuantity}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Discrepancy</div>
              <div
                className="stat-value"
                style={{ color: hasDiscrepancy ? 'var(--danger)' : 'var(--ok)' }}
              >
                {result.discrepancy > 0 ? `+${result.discrepancy}` : result.discrepancy}
              </div>
            </div>
          </div>

          {hasDiscrepancy ? (
            <div className="alert alert-error" style={{ marginTop: 12 }}>
              <span className="badge badge-danger">DISCREPANCY</span> Counted{' '}
              {result.countedQuantity}, expected {result.expectedQuantity}. This product is{' '}
              <strong>locked</strong> until the discrepancy is resolved.
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => void resolve()}
                  disabled={resolving}
                >
                  {resolving ? 'Resolving…' : 'Resolve & unlock'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <span className="badge badge-ok">BALANCED</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
