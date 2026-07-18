import { useCallback, useEffect, useState } from 'react';
import { api, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ExpenseRow, PLReport } from '../lib/types';

const money = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export function Finance() {
  const { user, can } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [pl, setPl] = useState<PLReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [plData, exp] = await Promise.all([
        api<PLReport>('/finance/pl').catch(() => null),
        api<ExpenseRow[]>('/finance/expenses'),
      ]);
      setPl(plData);
      setExpenses(exp);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    await api(`/finance/expenses/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
    await load();
  };

  const exportCsv = () => {
    // Stream the CSV with the auth header via fetch, then trigger a download.
    fetch(`${API_URL}/finance/expenses?format=csv`, {
      headers: { Authorization: `Bearer ${tokenStore.access}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'expenses.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <header className="page-head row">
        <div>
          <h1>Finance</h1>
          <p className="muted">Profit & loss and expense management {isOwner && '· owner view'}</p>
        </div>
        <button className="btn" onClick={exportCsv}>
          Export expenses CSV
        </button>
      </header>

      {pl && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Revenue (MTD)</div>
            <div className="stat-value">{money(pl.revenueCents)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Expenses (MTD)</div>
            <div className="stat-value">{money(pl.totalExpensesCents)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Net income</div>
            <div className="stat-value" style={{ color: pl.netIncomeCents >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
              {money(pl.netIncomeCents)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">HST/GST collected</div>
            <div className="stat-value">{money(pl.taxCollectedCents)}</div>
          </div>
        </div>
      )}

      <section className="panel">
        <h2>Expenses</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Vendor</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No expenses recorded.
                  </td>
                </tr>
              )}
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.incurredOn).toLocaleDateString('en-CA')}</td>
                  <td>{e.category.replace(/_/g, ' ')}</td>
                  <td>{e.description}</td>
                  <td>{e.vendor ?? '—'}</td>
                  <td className="num">{money(e.amountCents)}</td>
                  <td>
                    <span className={`badge ${e.status === 'APPROVED' || e.status === 'PAID' ? 'badge-ok' : 'badge-muted'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>
                    {e.status === 'SUBMITTED' && can('expense:approve') && e.submittedByUserId !== user?.id && (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" onClick={() => decide(e.id, 'APPROVED')}>
                          Approve
                        </button>
                        <button className="btn" onClick={() => decide(e.id, 'REJECTED')}>
                          Reject
                        </button>
                      </span>
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
