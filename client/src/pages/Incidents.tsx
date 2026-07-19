import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

type Category = 'MEDICATION_ERROR' | 'WORKPLACE_SAFETY' | 'THEFT_SECURITY' | 'PATIENT_COMPLAINT' | 'EQUIPMENT_FAILURE' | 'OTHER';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type Status = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

interface PharmacyOpt {
  id: string;
  name: string;
  code: string;
}

interface MyIncident {
  id: string;
  category: Category;
  severity: Severity;
  status: Status;
  occurredAt: string;
  location: string | null;
  description: string;
  actionTaken: string | null;
}

interface IncidentRow extends MyIncident {
  reportedBy: { id: string; firstName: string; lastName: string; role: { name: string } };
  pharmacy: { code: string; name: string };
}

const CATEGORY_LABELS: Record<Category, string> = {
  MEDICATION_ERROR: 'Medication error',
  WORKPLACE_SAFETY: 'Workplace safety',
  THEFT_SECURITY: 'Theft / security',
  PATIENT_COMPLAINT: 'Patient complaint',
  EQUIPMENT_FAILURE: 'Equipment failure',
  OTHER: 'Other',
};

const SEVERITY_BADGE: Record<Severity, string> = {
  LOW: 'badge-muted',
  MEDIUM: 'badge-muted',
  HIGH: 'badge-warn',
  CRITICAL: 'badge-error',
};

const STATUS_BADGE: Record<Status, string> = {
  OPEN: 'badge-warn',
  UNDER_REVIEW: 'badge-muted',
  RESOLVED: 'badge-ok',
  CLOSED: 'badge-muted',
};

const fmt = (s: string) => new Date(s).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function Incidents() {
  const { user, can } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const canTriage = can('incident:manage');
  const canViewAll = can('incident:read');

  const [locations, setLocations] = useState<PharmacyOpt[]>([]);
  const [filterLoc, setFilterLoc] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [mine, setMine] = useState<MyIncident[] | null>(null);
  const [rows, setRows] = useState<IncidentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isOwner) api<PharmacyOpt[]>('/pharmacies').then(setLocations).catch(() => {});
  }, [isOwner]);

  const load = useCallback(async () => {
    try {
      const jobs: Promise<unknown>[] = [api<MyIncident[]>('/incidents/mine').then(setMine)];
      if (canViewAll) {
        const params = new URLSearchParams();
        if (isOwner && filterLoc) params.set('pharmacyId', filterLoc);
        if (filterStatus) params.set('status', filterStatus);
        const q = params.toString() ? `?${params.toString()}` : '';
        jobs.push(api<IncidentRow[]>(`/incidents${q}`).then(setRows));
      }
      await Promise.all(jobs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [canViewAll, isOwner, filterLoc, filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: 'resolve' | 'close') => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/incidents/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Failed to ${action} incident`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>Incident Reports</h1>
        <p className="muted">File and triage workplace safety, security, and patient-complaint incidents</p>
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <ReportIncident
        isOwner={isOwner}
        locations={locations}
        filterLoc={filterLoc}
        onCreated={(m) => {
          setNotice(m);
          void load();
        }}
        onError={setError}
      />

      <section className="panel">
        <h2>My reports</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Occurred</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {(!mine || mine.length === 0) && (
                <tr>
                  <td colSpan={5} className="muted">
                    {mine ? 'No incidents reported.' : 'Loading…'}
                  </td>
                </tr>
              )}
              {mine?.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.occurredAt)}</td>
                  <td>{CATEGORY_LABELS[r.category]}</td>
                  <td>
                    <span className={`badge ${SEVERITY_BADGE[r.severity]}`}>{r.severity}</span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  </td>
                  <td>{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canViewAll && (
        <section className="panel">
          <div className="page-head row">
            <h2 style={{ margin: 0 }}>{isOwner ? 'All locations' : 'Location'} incidents</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select">
                <option value="">All statuses</option>
                <option value="OPEN">Open</option>
                <option value="UNDER_REVIEW">Under review</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              {isOwner && (
                <select value={filterLoc} onChange={(e) => setFilterLoc(e.target.value)} className="select">
                  <option value="">All locations</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Reported by</th>
                  <th>Occurred</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Description</th>
                  {canTriage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {!rows && (
                  <tr>
                    <td colSpan={canTriage ? 7 : 6} className="muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={canTriage ? 7 : 6} className="muted">
                      No incidents found.
                    </td>
                  </tr>
                )}
                {rows?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.reportedBy.lastName}, {r.reportedBy.firstName}
                    </td>
                    <td>{fmt(r.occurredAt)}</td>
                    <td>{CATEGORY_LABELS[r.category]}</td>
                    <td>
                      <span className={`badge ${SEVERITY_BADGE[r.severity]}`}>{r.severity}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                    </td>
                    <td>{r.description}</td>
                    {canTriage && (
                      <td>
                        {r.status !== 'RESOLVED' && r.status !== 'CLOSED' && (
                          <button
                            className="btn btn-ghost"
                            disabled={busyId === r.id}
                            onClick={() => act(r.id, 'resolve')}
                          >
                            Resolve
                          </button>
                        )}
                        {r.status === 'RESOLVED' && (
                          <button
                            className="btn btn-ghost"
                            disabled={busyId === r.id}
                            onClick={() => act(r.id, 'close')}
                          >
                            Close
                          </button>
                        )}
                      </td>
                    )}
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

function ReportIncident({
  isOwner,
  locations,
  filterLoc,
  onCreated,
  onError,
}: {
  isOwner: boolean;
  locations: PharmacyOpt[];
  filterLoc: string;
  onCreated: (msg: string) => void;
  onError: (m: string | null) => void;
}) {
  const [pharmacyId, setPharmacyId] = useState('');
  const [category, setCategory] = useState<Category>('WORKPLACE_SAFETY');
  const [severity, setSeverity] = useState<Severity>('LOW');
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date()));
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const needsLocation = isOwner && !filterLoc;
  const valid = description.trim() && occurredAt && (!needsLocation || pharmacyId);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      await api('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          ...(needsLocation ? { pharmacyId } : {}),
          category,
          severity,
          occurredAt: new Date(occurredAt).toISOString(),
          ...(location.trim() ? { location: location.trim() } : {}),
          description: description.trim(),
        }),
      });
      setDescription('');
      setLocation('');
      setSeverity('LOW');
      onCreated('Incident reported.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to report incident');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Report an incident</h2>
      <div className="form-grid">
        {needsLocation && (
          <label className="field">
            Location
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              <option value="">Select location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </label>
        <label className="field">
          Occurred at
          <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </label>
        <label className="field">
          Location within pharmacy (optional)
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Dispensing counter" />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened?"
            rows={3}
          />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? 'Reporting…' : 'Submit report'}
        </button>
      </div>
    </section>
  );
}
