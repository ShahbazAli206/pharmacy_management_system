import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

type Category = 'CONTINUING_EDUCATION' | 'CERTIFICATION' | 'ORIENTATION' | 'SAFETY' | 'OTHER';

interface PharmacyOpt {
  id: string;
  name: string;
  code: string;
}

interface StaffOpt {
  id: string;
  firstName: string;
  lastName: string;
  pharmacy: { id: string } | null;
}

interface MyRecord {
  id: string;
  title: string;
  provider: string | null;
  category: Category;
  creditHours: number | null;
  completedAt: string;
  expiresAt: string | null;
  notes: string | null;
}

interface TeamRecord extends MyRecord {
  user: { id: string; firstName: string; lastName: string; role: { name: string } };
  pharmacy: { code: string; name: string };
}

interface ExpiringRow {
  id: string;
  title: string;
  name: string;
  pharmacy: string;
  expiresAt: string;
  days: number;
  bucket: 'EXPIRED' | '30' | '60' | '90';
}

const CATEGORY_LABELS: Record<Category, string> = {
  CONTINUING_EDUCATION: 'Continuing education',
  CERTIFICATION: 'Certification',
  ORIENTATION: 'Orientation',
  SAFETY: 'Safety',
  OTHER: 'Other',
};

const BUCKET_BADGE: Record<ExpiringRow['bucket'], string> = {
  EXPIRED: 'badge-error',
  '30': 'badge-error',
  '60': 'badge-warn',
  '90': 'badge-muted',
};

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const toLocalDate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function Training() {
  const { user, can } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const canManage = can('training:manage');
  const canViewTeam = can('training:read');

  const [locations, setLocations] = useState<PharmacyOpt[]>([]);
  const [filterLoc, setFilterLoc] = useState('');
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [mine, setMine] = useState<MyRecord[] | null>(null);
  const [rows, setRows] = useState<TeamRecord[] | null>(null);
  const [expiring, setExpiring] = useState<ExpiringRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOwner) api<PharmacyOpt[]>('/pharmacies').then(setLocations).catch(() => {});
  }, [isOwner]);

  const load = useCallback(async () => {
    try {
      const jobs: Promise<unknown>[] = [api<MyRecord[]>('/training/mine').then(setMine)];
      if (canViewTeam) {
        const q = isOwner && filterLoc ? `?pharmacyId=${filterLoc}` : '';
        jobs.push(api<TeamRecord[]>(`/training${q}`).then(setRows));
        jobs.push(api<ExpiringRow[]>(`/training/expiring${q}`).then(setExpiring));
      }
      await Promise.all(jobs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [canViewTeam, isOwner, filterLoc]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    const q = isOwner && filterLoc ? `?pharmacyId=${filterLoc}` : '';
    api<StaffOpt[]>(`/users${q}`).then(setStaff).catch(() => {});
  }, [canManage, isOwner, filterLoc]);

  return (
    <div>
      <header className="page-head">
        <h1>Training &amp; CE</h1>
        <p className="muted">Continuing-education and certification tracking</p>
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <LogTraining
        isOwner={isOwner}
        canManage={canManage}
        locations={locations}
        staff={staff}
        filterLoc={filterLoc}
        onLogged={(m) => {
          setNotice(m);
          void load();
        }}
        onError={setError}
      />

      {canViewTeam && expiring && expiring.length > 0 && (
        <section className="panel">
          <h2>Expiring soon</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Credential</th>
                  <th>Location</th>
                  <th>Expires</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.title}</td>
                    <td>{r.pharmacy}</td>
                    <td>{fmtDate(r.expiresAt)}</td>
                    <td>
                      <span className={`badge ${BUCKET_BADGE[r.bucket]}`}>
                        {r.bucket === 'EXPIRED' ? 'Expired' : `${r.bucket} days`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>My training history</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Completed</th>
                <th>Title</th>
                <th>Category</th>
                <th>Provider</th>
                <th className="num">Hours</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {(!mine || mine.length === 0) && (
                <tr>
                  <td colSpan={6} className="muted">
                    {mine ? 'No training records yet.' : 'Loading…'}
                  </td>
                </tr>
              )}
              {mine?.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.completedAt)}</td>
                  <td>{r.title}</td>
                  <td>{CATEGORY_LABELS[r.category]}</td>
                  <td>{r.provider ?? '—'}</td>
                  <td className="num">{r.creditHours ?? '—'}</td>
                  <td>{r.expiresAt ? fmtDate(r.expiresAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canViewTeam && (
        <section className="panel">
          <div className="page-head row">
            <h2 style={{ margin: 0 }}>Team training records</h2>
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

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Completed</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th className="num">Hours</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {!rows && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No training records found.
                    </td>
                  </tr>
                )}
                {rows?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.user.lastName}, {r.user.firstName}
                    </td>
                    <td>{fmtDate(r.completedAt)}</td>
                    <td>{r.title}</td>
                    <td>{CATEGORY_LABELS[r.category]}</td>
                    <td className="num">{r.creditHours ?? '—'}</td>
                    <td>{r.expiresAt ? fmtDate(r.expiresAt) : '—'}</td>
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

function LogTraining({
  isOwner,
  canManage,
  locations,
  staff,
  filterLoc,
  onLogged,
  onError,
}: {
  isOwner: boolean;
  canManage: boolean;
  locations: PharmacyOpt[];
  staff: StaffOpt[];
  filterLoc: string;
  onLogged: (msg: string) => void;
  onError: (m: string | null) => void;
}) {
  const [onBehalf, setOnBehalf] = useState(false);
  const [userId, setUserId] = useState('');
  const [pharmacyId, setPharmacyId] = useState('');
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [category, setCategory] = useState<Category>('CONTINUING_EDUCATION');
  const [creditHours, setCreditHours] = useState('');
  const [completedAt, setCompletedAt] = useState(toLocalDate(new Date()));
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  const needsLocation = isOwner && !filterLoc && onBehalf;
  const valid = title.trim() && completedAt && (!onBehalf || userId) && (!needsLocation || pharmacyId);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      await api('/training', {
        method: 'POST',
        body: JSON.stringify({
          ...(onBehalf ? { userId } : {}),
          ...(needsLocation ? { pharmacyId } : {}),
          title: title.trim(),
          ...(provider.trim() ? { provider: provider.trim() } : {}),
          category,
          ...(creditHours ? { creditHours: Number(creditHours) } : {}),
          completedAt: new Date(completedAt).toISOString(),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      setTitle('');
      setProvider('');
      setCreditHours('');
      setExpiresAt('');
      onLogged('Training record logged.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to log training record');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Log a training record</h2>
      <div className="form-grid">
        {canManage && (
          <label className="field">
            Who is this for?
            <select value={onBehalf ? 'other' : 'me'} onChange={(e) => setOnBehalf(e.target.value === 'other')}>
              <option value="me">Myself</option>
              <option value="other">Another staff member</option>
            </select>
          </label>
        )}
        {onBehalf && (
          <label className="field">
            Staff member
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select staff…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName}, {s.firstName}
                </option>
              ))}
            </select>
          </label>
        )}
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
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Naloxone administration course" />
        </label>
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
          Provider (optional)
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="OCP" />
        </label>
        <label className="field">
          Credit hours (optional)
          <input type="number" min="0" step="0.5" value={creditHours} onChange={(e) => setCreditHours(e.target.value)} />
        </label>
        <label className="field">
          Completed on
          <input type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
        </label>
        <label className="field">
          Expires on (optional)
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? 'Logging…' : 'Log record'}
        </button>
      </div>
    </section>
  );
}
