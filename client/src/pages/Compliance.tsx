import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ChecklistItem, ComplianceAlert, ComplianceScore, LicenseWarnings } from '../lib/types';

export function Compliance() {
  const { can } = useAuth();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [score, setScore] = useState<ComplianceScore | null>(null);
  const [licenses, setLicenses] = useState<LicenseWarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, a, s, l] = await Promise.all([
        api<ChecklistItem[]>('/compliance/checklist'),
        api<ComplianceAlert[]>('/compliance/alerts'),
        api<ComplianceScore>('/compliance/score'),
        api<LicenseWarnings>('/compliance/license-expiry'),
      ]);
      setChecklist(c);
      setAlerts(a);
      setScore(s);
      setLicenses(l);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      await api('/compliance/checklist/generate', { method: 'POST', body: JSON.stringify({}) });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const complete = async (item: ChecklistItem) => {
    const signature = item.template.requiresSignature
      ? window.prompt('Signature required — enter your name/initials:') ?? ''
      : undefined;
    if (item.template.requiresSignature && !signature) return;
    await api(`/compliance/checklist/${item.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ signature }),
    });
    await load();
  };

  const resolve = async (id: string) => {
    await api(`/compliance/alerts/${id}/resolve`, { method: 'POST', body: JSON.stringify({}) });
    await load();
  };

  if (error) return <div className="alert alert-error">{error}</div>;

  const bandColor: Record<string, string> = { GREEN: 'var(--ok)', YELLOW: 'var(--warn)', RED: 'var(--danger)' };
  const licenseRows = [...(licenses?.licenses ?? []), ...(licenses?.permits ?? [])];

  return (
    <div>
      <header className="page-head row">
        <div>
          <h1>Compliance</h1>
          <p className="muted">Daily checklist, alerts, and license tracking</p>
        </div>
        {can('compliance:write') && (
          <button className="btn" onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : "Generate today's checklist"}
          </button>
        )}
      </header>

      <div className="stat-grid">
        {score && (
          <div className="stat-card">
            <div className="stat-label">Compliance score (month)</div>
            <div className="stat-value" style={{ color: bandColor[score.band] }}>
              {score.score}
            </div>
            <div className="stat-sub" style={{ color: bandColor[score.band] }}>
              {score.band} · {score.completed}/{score.total} tasks
            </div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Open alerts</div>
          <div className="stat-value">{alerts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">License/permit warnings</div>
          <div className="stat-value">{licenseRows.length}</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="panel">
          <h2>Alerts</h2>
          {alerts.map((a) => (
            <div
              key={a.id}
              className="alert"
              style={{
                background: a.severity === 'CRITICAL' ? '#fef2f2' : '#fffbeb',
                color: a.severity === 'CRITICAL' ? '#991b1b' : '#92400e',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                <strong>{a.severity}</strong> · {a.message}
              </span>
              {can('compliance:write') && (
                <button className="btn" onClick={() => resolve(a.id)}>
                  Resolve
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h2>Today's checklist</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Completed by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {checklist.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No checklist for today yet — generate it above.
                  </td>
                </tr>
              )}
              {checklist.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.label}
                    {item.template.requiresSignature && (
                      <span className="badge badge-muted" style={{ marginLeft: 6 }}>
                        signature
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        item.status === 'COMPLETED' ? 'badge-ok' : item.status === 'OVERDUE' ? '' : 'badge-muted'
                      }`}
                      style={item.status === 'OVERDUE' ? { background: '#fee2e2', color: '#991b1b' } : undefined}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="muted">
                    {item.completedBy ? `${item.completedBy.firstName} ${item.completedBy.lastName}` : '—'}
                  </td>
                  <td>
                    {item.status !== 'COMPLETED' && can('compliance:write') && (
                      <button className="btn btn-primary" onClick={() => complete(item)}>
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {licenseRows.length > 0 && (
        <section className="panel">
          <h2>License & permit expiry</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Expiry</th>
                  <th className="num">Days left</th>
                </tr>
              </thead>
              <tbody>
                {licenseRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.kind.replace('_', ' ')}</td>
                    <td>{r.name}</td>
                    <td>{new Date(r.expiry).toLocaleDateString('en-CA')}</td>
                    <td className="num">{r.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
