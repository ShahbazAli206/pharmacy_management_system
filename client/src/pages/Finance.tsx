import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, tokenStore } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import type { TranslationKey } from '../lib/i18n/translations';
import type { BudgetVariance, CashFlowForecast, ExpenseRow, PLReport } from '../lib/types';

const CATEGORIES = [
  'RENT_OCCUPANCY', 'PAYROLL', 'UTILITIES', 'BANK_FINANCING', 'INSURANCE',
  'PROFESSIONAL_FEES', 'MARKETING', 'IT_TECHNOLOGY', 'INVENTORY_PURCHASES',
  'REPAIRS_MAINTENANCE', 'MISCELLANEOUS',
] as const;

const money = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

type ApBucketKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus';
const AP_BUCKET_KEYS: { key: ApBucketKey; labelKey: TranslationKey }[] = [
  { key: 'current', labelKey: 'apBucketCurrent' },
  { key: 'd1_30', labelKey: 'apBucket1_30' },
  { key: 'd31_60', labelKey: 'apBucket31_60' },
  { key: 'd61_90', labelKey: 'apBucket61_90' },
  { key: 'd90plus', labelKey: 'apBucket90plus' },
];
interface ApAging {
  buckets: Record<ApBucketKey, { count: number; amountCents: number }>;
  totalOwedCents: number;
  count: number;
}

export function Finance() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [pl, setPl] = useState<PLReport | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [ap, setAp] = useState<ApAging | null>(null);
  const [variance, setVariance] = useState<BudgetVariance | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [plData, exp, apData, varianceData, cashFlowData] = await Promise.all([
        api<PLReport>('/finance/pl').catch(() => null),
        api<ExpenseRow[]>('/finance/expenses'),
        api<ApAging>('/finance/ap-aging').catch(() => null),
        api<BudgetVariance>('/finance/budget-variance').catch(() => null),
        api<CashFlowForecast>('/finance/cash-flow-forecast').catch(() => null),
      ]);
      setPl(plData);
      setExpenses(exp);
      setAp(apData);
      setVariance(varianceData);
      setCashFlow(cashFlowData);
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

  // Stream a CSV/PDF export with the auth header via fetch, then trigger a download.
  const downloadExport = (path: string, filename: string) => {
    fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${tokenStore.access}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      });
  };
  const exportCsv = () => downloadExport('/finance/expenses?format=csv', 'expenses.csv');
  const exportExpensesPdf = () => downloadExport('/finance/expenses?format=pdf', 'expenses.pdf');
  const exportPlPdf = () => downloadExport('/finance/pl?format=pdf', 'profit-loss.pdf');

  const canWrite = can('finance:write');
  const hasLocation = !!user?.pharmacy;

  const setBudget = async (category: string, month: string, amountCents: number) => {
    if (!user?.pharmacy) return;
    try {
      await api('/finance/budgets', {
        method: 'PUT',
        body: JSON.stringify({ pharmacyId: user.pharmacy.id, category, month, amountCents }),
      });
      setNotice(t('budgetSavedNotice'));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('failedToSaveBudget'));
    }
  };

  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <header className="page-head row">
        <div>
          <h1>{t('navFinance')}</h1>
          <p className="muted">{t('financeSubtitle')} {isOwner && t('ownerViewSuffix')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportCsv}>
            {t('exportExpensesCsvButton')}
          </button>
          <button className="btn" onClick={exportExpensesPdf}>
            {t('exportExpensesPdfButton')}
          </button>
        </div>
      </header>

      {pl && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">{t('statRevenueMtd')}</div>
            <div className="stat-value">{money(pl.revenueCents)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('statExpensesMtd')}</div>
            <div className="stat-value">{money(pl.totalExpensesCents)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('statNetIncome')}</div>
            <div className="stat-value" style={{ color: pl.netIncomeCents >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
              {money(pl.netIncomeCents)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('statHstGstCollected')}</div>
            <div className="stat-value">{money(pl.taxCollectedCents)}</div>
          </div>
          <div className="stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={exportPlPdf}>
              {t('downloadPlPdfButton')}
            </button>
          </div>
        </div>
      )}

      {ap && ap.count > 0 && (
        <section className="panel">
          <div className="page-head row">
            <h2 style={{ margin: 0 }}>{t('apAgingHeading')}</h2>
            <span className="muted">
              {t('unpaidCountLabel', { count: ap.count, amount: money(ap.totalOwedCents) })}
            </span>
          </div>
          <div className="stat-grid">
            {AP_BUCKET_KEYS.map(({ key, labelKey }) => {
              const b = ap.buckets[key];
              const color =
                b.amountCents === 0
                  ? undefined
                  : key === 'current'
                    ? 'var(--ok)'
                    : key === 'd90plus'
                      ? 'var(--danger)'
                      : 'var(--warn)';
              return (
                <div className="stat-card" key={key}>
                  <div className="stat-label">{t(labelKey)}</div>
                  <div className="stat-value" style={{ color }}>
                    {money(b.amountCents)}
                  </div>
                  <div className="stat-sub">{t('itemsCountLabel', { count: b.count })}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}

      {cashFlow && cashFlow.history.length > 0 && (
        <section className="panel">
          <h2>{t('cashFlowForecastHeading')}</h2>
          <p className="muted" style={{ marginTop: -8 }}>{cashFlow.method}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colMonth')}</th>
                  <th className="num">{t('colRevenue')}</th>
                  <th className="num">{t('colExpenses')}</th>
                  <th className="num">{t('colNetCashFlow')}</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.history.map((h) => (
                  <tr key={h.month}>
                    <td>{h.month}</td>
                    <td className="num">{money(h.revenueCents)}</td>
                    <td className="num">{money(h.expensesCents)}</td>
                    <td className="num" style={{ color: h.netCashFlowCents >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                      {money(h.netCashFlowCents)}
                    </td>
                  </tr>
                ))}
                {cashFlow.forecast.map((f) => (
                  <tr key={f.month}>
                    <td>
                      {f.month} <span className="badge badge-muted">{t('forecastBadge')}</span>
                    </td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num" style={{ color: f.netCashFlowCents >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                      {money(f.netCashFlowCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {variance && (
        <section className="panel">
          <div className="page-head row">
            <h2 style={{ margin: 0 }}>{t('budgetVarianceHeading', { month: variance.month })}</h2>
            <span className="muted">
              {t('budgetVarianceTotals', {
                actual: money(variance.totals.actualCents),
                budgeted: money(variance.totals.budgetedCents),
              })}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colCategory')}</th>
                  <th className="num">{t('colBudgeted')}</th>
                  <th className="num">{t('colActual')}</th>
                  <th className="num">{t('colVariance')}</th>
                </tr>
              </thead>
              <tbody>
                {variance.lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      {t('noBudgetsSetThisMonth')}
                    </td>
                  </tr>
                )}
                {variance.lines.map((l) => (
                  <tr key={l.category}>
                    <td>{l.category.replace(/_/g, ' ')}</td>
                    <td className="num">{money(l.budgetedCents)}</td>
                    <td className="num">{money(l.actualCents)}</td>
                    <td className="num" style={{ color: l.varianceCents > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                      {money(l.varianceCents)}
                      {l.variancePct !== null && ` (${l.variancePct > 0 ? '+' : ''}${l.variancePct}%)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canWrite && hasLocation && <SetBudgetForm onSave={setBudget} />}
        </section>
      )}

      <section className="panel">
        <h2>{t('expensesHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colDate')}</th>
                <th>{t('colCategory')}</th>
                <th>{t('colDescription')}</th>
                <th>{t('colVendor')}</th>
                <th className="num">{t('colAmount')}</th>
                <th>{t('colStatus')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {t('noExpensesRecorded')}
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
                          {t('approveButton')}
                        </button>
                        <button className="btn" onClick={() => decide(e.id, 'REJECTED')}>
                          {t('rejectButton')}
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

function SetBudgetForm({ onSave }: { onSave: (category: string, month: string, amountCents: number) => Promise<void> }) {
  const { t } = useI18n();
  const now = new Date();
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = category && month && amount && Number(amount) >= 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await onSave(category, month, Math.round(Number(amount) * 100));
      setAmount('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-grid" style={{ marginTop: 16 }}>
      <label className="field">
        {t('colCategory')}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('colMonth')}
        <input type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(`${e.target.value}-01`)} />
      </label>
      <label className="field">
        {t('budgetAmountLabel')}
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
        {busy ? t('saving') : t('setBudgetButton')}
      </button>
    </div>
  );
}
