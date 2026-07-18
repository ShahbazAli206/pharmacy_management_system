import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type {
  DailySummary,
  OwnerOverview,
  Paginated,
  PaymentMethod,
  ProductRow,
  SaleItemType,
  SaleResponse,
} from '../lib/types';

// Combined federal + provincial rate on TAXABLE goods, mirroring the server's
// tax table (server is authoritative — the completed receipt uses its figures;
// this only drives the live cart estimate). Rx drugs are zero-rated.
const PROVINCE_TAX_RATE: Record<string, number> = {
  ON: 0.13, BC: 0.12, AB: 0.05, MB: 0.12, SK: 0.11, QC: 0.14975,
  NS: 0.15, NB: 0.15, NL: 0.15, PE: 0.15, NT: 0.05, YT: 0.05, NU: 0.05,
};

const ITEM_TYPES: SaleItemType[] = ['OTC', 'RX', 'COMPOUND', 'SERVICE'];
const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'DEBIT', 'CREDIT', 'INSURANCE'];

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

interface CartLine {
  key: string;
  productId?: string;
  description: string;
  itemType: SaleItemType;
  quantity: number;
  unitPriceCents: number;
  /** When set, overrides the type-derived taxability. */
  taxableOverride?: boolean;
}

const isTaxable = (l: CartLine) => l.taxableOverride ?? l.itemType !== 'RX';

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

interface LocationOpt {
  id: string;
  name: string;
  province: string;
}

export function Sales() {
  const { user } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [tab, setTab] = useState<'sell' | 'reconcile'>('sell');

  // Owner must pick a location (drives pharmacyId + tax province); non-owners
  // are pinned to their own pharmacy by the API.
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');

  useEffect(() => {
    if (!isOwner) return;
    api<OwnerOverview>('/dashboard/owner')
      .then((o) => {
        const opts = o.locations.map((l) => ({ id: l.id, name: l.name, province: l.province }));
        setLocations(opts);
        if (opts[0]) setPharmacyId(opts[0].id);
      })
      .catch(() => {});
  }, [isOwner]);

  const province = isOwner
    ? locations.find((l) => l.id === pharmacyId)?.province ?? 'ON'
    : user?.pharmacy?.province ?? 'ON';

  return (
    <div>
      <header className="page-head">
        <h1>Point of Sale</h1>
        <p className="muted">OTC &amp; prescription checkout, tax, and daily cash reconciliation</p>
      </header>

      <div className="tabs">
        <button className={`tab ${tab === 'sell' ? 'active' : ''}`} onClick={() => setTab('sell')}>
          Sell
        </button>
        <button
          className={`tab ${tab === 'reconcile' ? 'active' : ''}`}
          onClick={() => setTab('reconcile')}
        >
          Daily reconciliation
        </button>
      </div>

      {isOwner && (
        <div className="toolbar">
          <label className="field" style={{ minWidth: 260 }}>
            Location
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              {locations.length === 0 && <option value="">Loading…</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.province})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {tab === 'sell' ? (
        <SellTab
          isOwner={isOwner}
          pharmacyId={pharmacyId}
          province={province}
          ready={!isOwner || !!pharmacyId}
        />
      ) : (
        <ReconcileTab isOwner={isOwner} pharmacyId={pharmacyId} ready={!isOwner || !!pharmacyId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sell
// ---------------------------------------------------------------------------

function SellTab({
  isOwner,
  pharmacyId,
  province,
  ready,
}: {
  isOwner: boolean;
  pharmacyId: string;
  province: string;
  ready: boolean;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SaleResponse | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced catalog search.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = search.trim();
    if (!q) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      api<Paginated<ProductRow>>(`/products?search=${encodeURIComponent(q)}&pageSize=8`)
        .then((r) => setResults(r.items))
        .catch(() => setResults([]));
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const addProduct = (p: ProductRow) => {
    setReceipt(null);
    setCart((prev) => {
      // Bump quantity if the same product is already in the cart.
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key: nextKey(),
          productId: p.id,
          description: `${p.name} ${p.strength}`.trim(),
          itemType: p.schedule === 'OTC' ? 'OTC' : 'RX',
          quantity: 1,
          unitPriceCents: p.defaultPriceCents,
        },
      ];
    });
    setSearch('');
    setResults([]);
  };

  const addCustomLine = () => {
    setReceipt(null);
    setCart((prev) => [
      ...prev,
      { key: nextKey(), description: '', itemType: 'SERVICE', quantity: 1, unitPriceCents: 0 },
    ]);
  };

  const patch = (key: string, changes: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));
  const clearCart = () => {
    setCart([]);
    setReceipt(null);
    setError(null);
  };

  const totals = useMemo(() => {
    const rate = PROVINCE_TAX_RATE[province] ?? 0.13;
    const subtotal = cart.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const taxable = cart
      .filter(isTaxable)
      .reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const tax = Math.round(taxable * rate);
    return { subtotal, tax, total: subtotal + tax, rate };
  }, [cart, province]);

  const valid =
    ready && cart.length > 0 && cart.every((l) => l.description.trim() && l.quantity > 0);

  const complete = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const sale = await api<SaleResponse>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          ...(isOwner ? { pharmacyId } : {}),
          paymentMethod,
          lines: cart.map((l) => ({
            itemType: l.itemType,
            description: l.description.trim(),
            productId: l.productId,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            taxable: isTaxable(l),
          })),
        }),
      });
      setReceipt(sale);
      setCart([]);
      setSearch('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sale failed');
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return <Receipt sale={receipt} onNew={() => setReceipt(null)} />;
  }

  return (
    <div className="pos-grid">
      {/* Left: catalog search + results */}
      <section className="panel">
        <h2>Add items</h2>
        {!ready && <div className="alert">Select a location to start a sale.</div>}
        <label className="field" style={{ marginBottom: 12 }}>
          Search catalog (name or DIN)
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Ibuprofen or 00000002"
            disabled={!ready}
          />
        </label>

        {results.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {results.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {p.name} {p.strength}
                        {p.isControlled && (
                          <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                            Controlled
                          </span>
                        )}
                      </div>
                      <div className="muted mono" style={{ fontSize: 12 }}>
                        DIN {p.din} · {p.schedule}
                      </div>
                    </td>
                    <td className="num">{money(p.defaultPriceCents)}</td>
                    <td style={{ width: 1 }}>
                      <button className="btn btn-primary" onClick={() => addProduct(p)}>
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button className="btn btn-ghost" onClick={addCustomLine} disabled={!ready} style={{ marginTop: 12 }}>
          + Add custom line (service / compound)
        </button>
      </section>

      {/* Right: cart + totals */}
      <section className="panel">
        <div className="page-head row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Cart</h2>
          {cart.length > 0 && (
            <button className="btn btn-ghost" onClick={clearCart}>
              Clear
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
                <th className="num">Line</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Cart is empty. Search the catalog and add items.
                  </td>
                </tr>
              )}
              {cart.map((l) => (
                <tr key={l.key}>
                  <td>
                    {l.productId ? (
                      <span>{l.description}</span>
                    ) : (
                      <input
                        value={l.description}
                        onChange={(e) => patch(l.key, { description: e.target.value })}
                        placeholder="Description"
                        style={{ width: '100%' }}
                      />
                    )}
                    {!isTaxable(l) && (
                      <span className="badge badge-muted" style={{ marginLeft: 6 }}>
                        Tax-exempt
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      className="select"
                      value={l.itemType}
                      onChange={(e) => patch(l.key, { itemType: e.target.value as SaleItemType, taxableOverride: undefined })}
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => patch(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      style={{ width: 64, textAlign: 'right' }}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={(l.unitPriceCents / 100).toFixed(2)}
                      onChange={(e) =>
                        patch(l.key, { unitPriceCents: Math.max(0, Math.round(Number(e.target.value) * 100) || 0) })
                      }
                      style={{ width: 84, textAlign: 'right' }}
                    />
                  </td>
                  <td className="num">{money(l.unitPriceCents * l.quantity)}</td>
                  <td>
                    <button className="btn btn-ghost" onClick={() => removeLine(l.key)} title="Remove">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pos-totals">
          <div className="row">
            <span className="muted">Subtotal</span>
            <span className="num">{money(totals.subtotal)}</span>
          </div>
          <div className="row">
            <span className="muted">
              Tax ({(totals.rate * 100).toFixed(totals.rate === 0.14975 ? 3 : 0)}% · {province})
            </span>
            <span className="num">{money(totals.tax)}</span>
          </div>
          <div className="row pos-total">
            <span>Total</span>
            <span className="num">{money(totals.total)}</span>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 16 }}>
          <label className="field" style={{ minWidth: 160 }}>
            Payment method
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            onClick={complete}
            disabled={!valid || busy}
            style={{ marginLeft: 'auto', minWidth: 160 }}
          >
            {busy ? 'Processing…' : `Take payment · ${money(totals.total)}`}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Prescription lines are zero-rated. OTC stock is decremented on completion. Final tax is
          calculated by the server.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receipt (post-sale, authoritative server figures) + print
// ---------------------------------------------------------------------------

function Receipt({ sale, onNew }: { sale: SaleResponse; onNew: () => void }) {
  const printReceipt = () => {
    const w = window.open('', 'receipt', 'width=380,height=600');
    if (!w) return;
    const rows = sale.lines
      .map(
        (l) =>
          `<tr><td>${escapeHtml(l.description)} ×${l.quantity}</td><td style="text-align:right">${money(
            l.lineTotalCents,
          )}</td></tr>`,
      )
      .join('');
    w.document.write(`
      <html><head><title>Receipt ${sale.id.slice(0, 8)}</title>
      <style>
        body{font-family:ui-monospace,monospace;font-size:12px;padding:16px;color:#111}
        h2{font-size:14px;margin:0 0 4px} table{width:100%;border-collapse:collapse;margin-top:8px}
        td{padding:2px 0} .tot{border-top:1px dashed #999;margin-top:8px;padding-top:8px}
        .row{display:flex;justify-content:space-between}
      </style></head><body>
      <h2>PharmaSuite Pharmacy</h2>
      <div>Sale ${sale.id.slice(0, 8)}</div>
      <div>${new Date(sale.createdAt).toLocaleString('en-CA')}</div>
      <div>Payment: ${sale.paymentMethod}</div>
      <table>${rows}</table>
      <div class="tot">
        <div class="row"><span>Subtotal</span><span>${money(sale.subtotalCents)}</span></div>
        <div class="row"><span>Tax (${sale.province})</span><span>${money(sale.taxCents)}</span></div>
        <div class="row" style="font-weight:700"><span>Total</span><span>${money(sale.totalCents)}</span></div>
      </div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <section className="panel" style={{ maxWidth: 560 }}>
      <div className="page-head row">
        <h2 style={{ margin: 0 }}>Sale complete</h2>
        <span className="badge badge-ok">{sale.paymentMethod}</span>
      </div>
      <p className="muted mono" style={{ fontSize: 12 }}>
        {sale.id} · {new Date(sale.createdAt).toLocaleString('en-CA')}
      </p>

      <div className="table-wrap">
        <table className="table">
          <tbody>
            {sale.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.description}
                  {!l.taxable && (
                    <span className="badge badge-muted" style={{ marginLeft: 6 }}>
                      zero-rated
                    </span>
                  )}
                </td>
                <td className="num">×{l.quantity}</td>
                <td className="num">{money(l.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pos-totals">
        <div className="row">
          <span className="muted">Subtotal</span>
          <span className="num">{money(sale.subtotalCents)}</span>
        </div>
        <div className="row">
          <span className="muted">Tax ({sale.province})</span>
          <span className="num">{money(sale.taxCents)}</span>
        </div>
        <div className="row pos-total">
          <span>Total</span>
          <span className="num">{money(sale.totalCents)}</span>
        </div>
      </div>

      <div className="form-row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={onNew}>
          New sale
        </button>
        <button className="btn" onClick={printReceipt}>
          Print receipt
        </button>
      </div>
    </section>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

// ---------------------------------------------------------------------------
// Daily reconciliation
// ---------------------------------------------------------------------------

function ReconcileTab({
  isOwner,
  pharmacyId,
  ready,
}: {
  isOwner: boolean;
  pharmacyId: string;
  ready: boolean;
}) {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState('');

  const load = useCallback(async () => {
    if (!ready) return;
    setError(null);
    try {
      const q = isOwner && pharmacyId ? `?pharmacyId=${pharmacyId}` : '';
      setSummary(await api<DailySummary>(`/sales/daily-summary${q}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [isOwner, pharmacyId, ready]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) return <div className="alert">Select a location to view reconciliation.</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!summary) return <div className="muted">Loading summary…</div>;

  const expectedCashCents = summary.byPaymentMethod.CASH ?? 0;
  const countedCents = counted.trim() ? Math.round(Number(counted) * 100) : null;
  const variance = countedCents === null ? null : countedCents - expectedCashCents;

  return (
    <>
      <div className="page-head row">
        <h2 style={{ margin: 0 }}>Daily summary · {summary.date}</h2>
        <button className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="stat-grid">
        <Stat label="Transactions" value={String(summary.transactionCount)} />
        <Stat label="Subtotal" value={money(summary.subtotalCents)} />
        <Stat label="Tax collected" value={money(summary.taxCents)} />
        <Stat label="Total takings" value={money(summary.totalCents)} />
      </div>

      <section className="panel">
        <h2>By payment method</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {PAYMENT_METHODS.map((m) => (
                <tr key={m}>
                  <td>{m}</td>
                  <td className="num">{money(summary.byPaymentMethod[m] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ maxWidth: 480 }}>
        <h2>Cash reconciliation</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="muted">Expected cash (system)</span>
          <span className="num">{money(expectedCashCents)}</span>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          Counted cash in drawer
          <input
            type="number"
            min={0}
            step="0.01"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="0.00"
          />
        </label>
        {variance !== null && (
          <div className="row pos-total">
            <span>Variance</span>
            <span
              className="num"
              style={{ color: variance === 0 ? 'var(--ok)' : 'var(--danger)' }}
            >
              {variance > 0 ? '+' : ''}
              {money(variance)}
            </span>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
