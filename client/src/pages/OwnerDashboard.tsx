import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { OwnerOverview } from '../lib/types';

const currency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

export function OwnerDashboard() {
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OwnerOverview>('/dashboard/owner')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="muted">Loading overview…</div>;

  return (
    <div>
      <header className="page-head">
        <h1>Owner Overview</h1>
        <p className="muted">Consolidated across all locations</p>
      </header>

      <div className="stat-grid">
        <Stat label="Locations" value={`${data.totals.activeLocations}/${data.totals.locations}`} sub="active" />
        <Stat label="Staff" value={data.totals.staff.toString()} />
        <Stat label="Patients" value={data.totals.patients.toLocaleString()} />
        <Stat label="Revenue today" value={currency(data.totals.revenueToday)} sub="across all locations" />
        <Stat label="Prescriptions today" value={data.totals.prescriptionsToday.toString()} />
        <Stat label="Pending reports" value={data.pendingPartnerReports.toString()} />
      </div>

      <section className="panel">
        <h2>Locations</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Province</th>
                <th>Status</th>
                <th className="num">Staff</th>
                <th className="num">Patients</th>
                <th>Alerts</th>
                <th>Compliance</th>
              </tr>
            </thead>
            <tbody>
              {data.locations.map((loc) => (
                <tr key={loc.id}>
                  <td className="mono">{loc.code}</td>
                  <td>{loc.name}</td>
                  <td>{loc.province}</td>
                  <td>
                    <span className={`badge ${loc.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>
                      {loc.status}
                    </span>
                  </td>
                  <td className="num">{loc.staffCount}</td>
                  <td className="num">{loc.patientCount}</td>
                  <td>
                    {loc.lowStockAlerts + loc.expiryAlerts === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="badge badge-warn">
                        {loc.lowStockAlerts} low · {loc.expiryAlerts} exp
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`dot dot-${loc.complianceStatus.toLowerCase()}`} />
                    {loc.complianceStatus}
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
