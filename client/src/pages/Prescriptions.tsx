import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { PrescriptionRow } from '../lib/types';

export function Prescriptions() {
  const { can } = useAuth();
  const [rows, setRows] = useState<PrescriptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<PrescriptionRow[]>('/prescriptions'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dispense = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      const res = await api<{ refillsRemaining: number }>(`/prescriptions/${id}/dispense`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(`Dispensed. ${res.refillsRemaining} fill(s) remaining.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Dispense failed');
    } finally {
      setBusyId(null);
    }
  };

  if (error && !rows) return <div className="alert alert-error">{error}</div>;
  if (!rows) return <div className="muted">Loading prescriptions…</div>;

  const fillsRemaining = (r: PrescriptionRow) => 1 + r.refillsAuthorized - r.refillsUsed;

  return (
    <div>
      <header className="page-head">
        <h1>Prescriptions</h1>
        <p className="muted">{rows.length} record(s)</p>
      </header>

      {notice && <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Drug</th>
                <th>Prescriber</th>
                <th className="num">Fills left</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No prescriptions yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.patient.lastName}, {r.patient.firstName}
                  </td>
                  <td>
                    {r.drugName} {r.strength}
                    {r.isControlled && (
                      <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', marginLeft: 6 }}>
                        Controlled
                      </span>
                    )}
                  </td>
                  <td>
                    {r.prescriber.firstName} {r.prescriber.lastName}
                  </td>
                  <td className="num">{fillsRemaining(r)}</td>
                  <td>
                    <span className={`badge ${r.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {can('prescription:dispense') && r.status === 'ACTIVE' && fillsRemaining(r) > 0 && (
                      <button
                        className="btn btn-primary"
                        disabled={busyId === r.id}
                        onClick={() => dispense(r.id)}
                      >
                        {busyId === r.id ? 'Dispensing…' : 'Dispense'}
                      </button>
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
