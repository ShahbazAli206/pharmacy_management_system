import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n/I18nContext';
import type { TranslationKey } from '../lib/i18n/translations';
import type { ReportResult, SavedReportRow } from '../lib/types';

const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

const REPORT_TYPES: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: 'SALES_BY_DAY', labelKey: 'reportTypeSalesByDay' },
  { value: 'EXPENSES_BY_CATEGORY', labelKey: 'reportTypeExpensesByCategory' },
  { value: 'RX_VOLUME', labelKey: 'reportTypeRxVolume' },
  { value: 'SALES_FORECAST', labelKey: 'reportTypeSalesForecast' },
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
  const { t } = useI18n();
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
        <h1>{t('reportsHeading')}</h1>
        <p className="muted">{t('reportsSubtitle')}</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <h2>{t('runReportHeading')}</h2>
        <div className="form-row">
          <label className="field">
            {t('reportTypeLabel')}
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={() => run(type)} disabled={busy}>
            {busy ? t('runningEllipsis') : t('runReportButton')}
          </button>
        </div>

        {result && result.series && (
          <table className="table">
            <thead>
              <tr>
                <th>{t('colDate')}</th>
                <th className="num">{isCurrency ? t('colRevenue') : t('colCount')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {result.series.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    {t('noDataInPeriod')}
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
                <th>{t('colCategory')}</th>
                <th className="num">{t('colAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(result.data).length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    {t('noExpensesInPeriod')}
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
            <p className="muted">{t('methodLabel', { method: result.method })}</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('colDate')}</th>
                    <th className="num">{t('colProjectedRevenue')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.forecast.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        {t('notEnoughHistoryToForecast')}
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
        <h2>{t('savedReportsHeading')}</h2>
        <div className="form-row">
          <label className="field">
            {t('saveCurrentTypeAsLabel')}
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={t('savedReportNamePlaceholder')} />
          </label>
          <button className="btn" onClick={save} disabled={!saveName.trim()}>
            {t('saveButton')}
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colName')}</th>
                <th>{t('colType')}</th>
                <th>{t('colCreated')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {saved.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {t('noSavedReports')}
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
                      {t('runButton')}
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
