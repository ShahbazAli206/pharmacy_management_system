import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ReportResult, SavedReportRow } from '../lib/types';

const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

const REPORT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'SALES_BY_DAY', label: 'Sales by day' },
  { value: 'EXPENSES_BY_CATEGORY', label: 'Expenses by category' },
  { value: 'RX_VOLUME', label: 'Prescription volume' },
  { value: 'SALES_FORECAST', label: 'Sales forecast' },
];

/** Horizontal bar cell, width normalized to the series max. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" style={{ marginBottom: 0, width: 160, display: 'inline-block', verticalAlign: 'middle' }}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Reports() {
  const [type, setType] = useState('SALES_BY_DAY');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [saved, setSaved] = useState<SavedReportRow[]>([]);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSaved = useCallback(async () => {
    try {
      setSaved(await api<SavedReportRow[]>('/reports/saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const run = useCallback(
    async (reportType: string) => {
      setBusy(true);
      setError(null);
      try {
        setResult(await api<ReportResult>('/reports/run', { method: 'POST', body: JSON.stringify({ type: reportType, params: {} }) }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const save = async () => {
    if (!saveName.trim()) return;
    await api('/reports/saved', { method: 'POST', body: JSON.stringify({ name: saveName.trim(), type, paramsJson: '{}' }) });
    setSaveName('');
    await loadSaved();
  };

  const isCurrency = type !== 'RX_VOLUME';
  const seriesVal = (p: { value?: number; valueCents?: number }) => p.valueCents ?? p.value ?? 0;

  return (
    <div>
      <header className="page-head">
        <h1>Reports &amp; Analytics</h1>
        <p className="muted">Sales, expenses, prescription volume, and forecasting</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <h2>Run a report</h2>
        <div className="form-row">
          <label className="field">
            Report type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={() => run(type)} disabled={busy}>
            {busy ? 'Running…' : 'Run report'}
          </button>
        </div>

        {result && result.series && (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">{isCurrency ? 'Revenue' : 'Count'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {result.series.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No data in this period.
                  </td>
                </tr>
              )}
              {result.series.map((p) => {
                const max = Math.max(...result.series!.map(seriesVal), 1);
                return (
                  <tr key={p.date}>
                    <td>{p.date}</td>
                    <td className="num">{isCurrency ? money(seriesVal(p)) : seriesVal(p)}</td>
                    <td>
                      <Bar value={seriesVal(p)} max={max} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {result && result.data && (
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(result.data).length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    No expenses in this period.
                  </td>
                </tr>
              )}
              {Object.entries(result.data).map(([cat, cents]) => (
                <tr key={cat}>
                  <td>{cat.replace(/_/g, ' ')}</td>
                  <td className="num">{money(cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {result && result.forecast && (
          <>
            <p className="muted">Method: {result.method}</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Projected revenue</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.forecast.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        Not enough history to forecast.
                      </td>
                    </tr>
                  )}
                  {result.forecast.map((p) => {
                    const max = Math.max(...result.forecast!.map((x) => x.valueCents), 1);
                    return (
                      <tr key={p.date}>
                        <td>{p.date}</td>
                        <td className="num">{money(p.valueCents)}</td>
                        <td>
                          <Bar value={p.valueCents} max={max} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Saved reports</h2>
        <div className="form-row">
          <label className="field">
            Save current type as
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Monthly sales" />
          </label>
          <button className="btn" onClick={save} disabled={!saveName.trim()}>
            Save
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {saved.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No saved reports.
                  </td>
                </tr>
              )}
              {saved.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="mono">{r.type}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString('en-CA')}</td>
                  <td>
                    <button className="btn" onClick={() => { setType(r.type); void run(r.type); }}>
                      Run
                    </button>
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
