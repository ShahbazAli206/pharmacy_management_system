import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n/I18nContext';
import type { ExpiryAlert, InventoryRow } from '../lib/types';

export function Inventory() {
  const { t } = useI18n();
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [expiry, setExpiry] = useState<ExpiryAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  const bucketLabel: Record<ExpiryAlert['bucket'], string> = {
    EXPIRED: t('bucketExpired'),
    '30': t('bucket30'),
    '60': t('bucket60'),
    '90': t('bucket90'),
  };

  useEffect(() => {
    Promise.all([api<InventoryRow[]>('/inventory'), api<ExpiryAlert[]>('/inventory/alerts/expiry')])
      .then(([inv, exp]) => {
        setRows(inv);
        setExpiry(exp);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!rows) return <div className="muted">{t('loadingInventory')}</div>;

  const lowCount = rows.filter((r) => r.belowThreshold && r.reorderThreshold > 0).length;

  return (
    <div>
      <header className="page-head">
        <h1>{t('navInventory')}</h1>
        <p className="muted">
          {t('productsCount', { count: rows.length })} · {t('belowReorderCount', { count: lowCount })} ·{' '}
          {t('expiryAlertsCount', { count: expiry.length })}
        </p>
      </header>

      {expiry.length > 0 && (
        <section className="panel">
          <h2>{t('expiryAlertsHeading')}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colProduct')}</th>
                  <th>{t('colLot')}</th>
                  <th>{t('colExpiry')}</th>
                  <th>{t('colWindow')}</th>
                  <th className="num">{t('colQty')}</th>
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
        <h2>{t('stockOnHandHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colDin')}</th>
                <th>{t('colProduct')}</th>
                <th>{t('colStrength')}</th>
                <th className="num">{t('colOnHand')}</th>
                <th className="num">{t('colReorderAt')}</th>
                <th>{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {t('noInventoryYet')}
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
                        {t('reorderBadge')}
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
