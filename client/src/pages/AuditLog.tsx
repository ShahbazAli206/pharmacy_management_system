import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n/I18nContext';
import type { AuditEntry, Paginated } from '../lib/types';

export function AuditLog() {
  const { t } = useI18n();
  const [data, setData] = useState<Paginated<AuditEntry> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Paginated<AuditEntry>>(`/audit?page=${page}&pageSize=50`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="muted">{t('loadingAuditLog')}</div>;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <header className="page-head">
        <h1>{t('auditLogHeading')}</h1>
        <p className="muted">{t('auditLogSubtitle', { count: data.total.toLocaleString() })}</p>
      </header>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colTime')}</th>
                <th>{t('colUser')}</th>
                <th>{t('colAction')}</th>
                <th>{t('colEntity')}</th>
                <th>{t('colIp')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {t('noAuditEvents')}
                  </td>
                </tr>
              )}
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleString('en-CA')}</td>
                  <td>{e.user ? `${e.user.firstName} ${e.user.lastName}` : '—'}</td>
                  <td>
                    <span className="badge badge-muted">{e.action}</span>
                  </td>
                  <td>
                    {e.entity}
                    {e.entityId && <span className="mono muted"> · {e.entityId.slice(0, 8)}</span>}
                  </td>
                  <td className="mono">{e.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('previous')}
          </button>
          <span className="muted">{t('pageOf', { page, totalPages })}</span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t('next')}
          </button>
        </div>
      </section>
    </div>
  );
}
