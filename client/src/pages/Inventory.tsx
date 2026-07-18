import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ExpiryAlert, InventoryRow } from '../lib/types';

const bucketLabel: Record<ExpiryAlert['bucket'], string> = {
  EXPIRED: 'Expired',
  '30': '≤30 days',
  '60': '≤60 days',
  '90': '≤90 days',
};

export function Inventory() {
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [expiry, setExpiry] = useState<ExpiryAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<InventoryRow[]>('/inventory'), api<ExpiryAlert[]>('/inventory/alerts/expiry')])
      .then(([inv, exp]) => {
        setRows(inv);
        setExpiry(exp);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!rows) return <div className="muted">Loading inventory…</div>;

  const lowCount = rows.filter((r) => r.belowThreshold && r.reorderThreshold > 0).length;

  return (
    <div>
      <header className="page-head">
        <h1>Inventory</h1>
        <p className="muted">
          {rows.length} product(s) · {lowCount} below reorder threshold · {expiry.length} expiry alert(s)
        </p>
      </header>

      {expiry.length > 0 && (
        <section className="panel">
          <h2>Expiry alerts</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Lot</th>
                  <th>Expiry</th>
                  <th>Window</th>
                  <th className="num">Qty</th>
                </tr>
              </thead>
              <tbody>
                {expiry.map((e) => (
                  <tr key={e.lotId}>
                    <td>{e.product}</td>
                    <td className="mono">{e.lotNumber ?? '—'}</td>
                    <td>{new Date(e.expiryDate).toLocaleDateString('en-CA')}</td>
                    <td>
                      <span className={`badge ${e.bucket === 'EXPIRED' ? 'badge-muted' : 'badge-ok'}`}>
                        {bucketLabel[e.bucket]}
                      </span>
                    </td>
                    <td className="num">{e.quantityOnHand}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Stock on hand</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>DIN</th>
                <th>Product</th>
                <th>Strength</th>
                <th className="num">On hand</th>
                <th className="num">Reorder at</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No inventory yet. Receive stock via the API to populate this list.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.product.din}</td>
                  <td>{r.product.name}</td>
                  <td>{r.product.strength}</td>
                  <td className="num">{r.quantityOnHand}</td>
                  <td className="num">{r.reorderThreshold || '—'}</td>
                  <td>
                    {r.belowThreshold && r.reorderThreshold > 0 ? (
                      <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                        Reorder
                      </span>
                    ) : (
                      <span className="badge badge-ok">OK</span>
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
