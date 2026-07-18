import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LocationOverview } from '../lib/types';

export function LocationDashboard() {
  const [data, setData] = useState<LocationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LocationOverview>('/dashboard/location')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="muted">Loading location…</div>;

  const checklistPct =
    data.complianceChecklist.total === 0
      ? 0
      : Math.round((data.complianceChecklist.completed / data.complianceChecklist.total) * 100);

  return (
    <div>
      <header className="page-head">
        <h1>{data.pharmacy.name}</h1>
        <p className="muted">
          {data.pharmacy.code} · {data.pharmacy.province}
        </p>
      </header>

      <div className="stat-grid">
        <Stat label="Patients" value={data.patientCount.toLocaleString()} />
        <Stat label="Staff" value={data.staffCount.toString()} />
        <Stat label="Sales today" value={`$${data.salesToday}`} sub="wiring in Phase 2" />
        <Stat label="Prescriptions today" value={data.prescriptionsToday.toString()} sub="wiring in Phase 2" />
        <Stat label="Reorder alerts" value={data.reorderAlerts.toString()} sub="wiring in Phase 2" />
        <Stat label="Refills due today" value={data.refillsDueToday.toString()} sub="wiring in Phase 2" />
      </div>

      <section className="panel">
        <h2>Compliance checklist</h2>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${checklistPct}%` }} />
        </div>
        <p className="muted">
          {data.complianceChecklist.completed}/{data.complianceChecklist.total} tasks complete
          {data.complianceChecklist.total === 0 && ' — checklist module arrives in Phase 3'}
        </p>
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
