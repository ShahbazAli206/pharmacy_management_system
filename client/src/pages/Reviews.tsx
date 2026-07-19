import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

type Rating = 'NEEDS_IMPROVEMENT' | 'MEETS_EXPECTATIONS' | 'EXCEEDS_EXPECTATIONS' | 'OUTSTANDING';
type Status = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';

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

interface MyReview {
  id: string;
  periodStart: string;
  periodEnd: string;
  rating: Rating;
  strengths: string | null;
  areasForImprovement: string | null;
  goals: string | null;
  comments: string | null;
  status: Status;
  acknowledgedAt: string | null;
  reviewer: { firstName: string; lastName: string };
}

interface TeamReview extends MyReview {
  user: { id: string; firstName: string; lastName: string; role: { name: string } };
  pharmacy: { code: string; name: string };
}

const RATING_LABELS: Record<Rating, string> = {
  NEEDS_IMPROVEMENT: 'Needs improvement',
  MEETS_EXPECTATIONS: 'Meets expectations',
  EXCEEDS_EXPECTATIONS: 'Exceeds expectations',
  OUTSTANDING: 'Outstanding',
};

const RATING_BADGE: Record<Rating, string> = {
  NEEDS_IMPROVEMENT: 'badge-error',
  MEETS_EXPECTATIONS: 'badge-muted',
  EXCEEDS_EXPECTATIONS: 'badge-ok',
  OUTSTANDING: 'badge-ok',
};

const STATUS_BADGE: Record<Status, string> = {
  DRAFT: 'badge-muted',
  SUBMITTED: 'badge-warn',
  ACKNOWLEDGED: 'badge-ok',
};

const fmt = (s: string) => new Date(s).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const toLocalDate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function Reviews() {
  const { user, can } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const canManage = can('review:manage');
  const canViewTeam = can('review:read');

  const [locations, setLocations] = useState<PharmacyOpt[]>([]);
  const [filterLoc, setFilterLoc] = useState('');
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [mine, setMine] = useState<MyReview[] | null>(null);
  const [rows, setRows] = useState<TeamReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isOwner) api<PharmacyOpt[]>('/pharmacies').then(setLocations).catch(() => {});
  }, [isOwner]);

  const load = useCallback(async () => {
    try {
      const jobs: Promise<unknown>[] = [api<MyReview[]>('/reviews/mine').then(setMine)];
      if (canViewTeam) {
        const q = isOwner && filterLoc ? `?pharmacyId=${filterLoc}` : '';
        jobs.push(api<TeamReview[]>(`/reviews${q}`).then(setRows));
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

  const act = async (id: string, action: 'submit' | 'acknowledge') => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/reviews/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Failed to ${action} review`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>Performance Reviews</h1>
        <p className="muted">Draft, submit, and acknowledge staff performance reviews</p>
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {canManage && (
        <DraftReview
          isOwner={isOwner}
          locations={locations}
          staff={staff}
          filterLoc={filterLoc}
          onCreated={(m) => {
            setNotice(m);
            void load();
          }}
          onError={setError}
        />
      )}

      <section className="panel">
        <h2>My reviews</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Rating</th>
                <th>Reviewer</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(!mine || mine.length === 0) && (
                <tr>
                  <td colSpan={5} className="muted">
                    {mine ? 'No reviews yet.' : 'Loading…'}
                  </td>
                </tr>
              )}
              {mine?.map((r) => (
                <tr key={r.id}>
                  <td>
                    {fmt(r.periodStart)} – {fmt(r.periodEnd)}
                  </td>
                  <td>
                    <span className={`badge ${RATING_BADGE[r.rating]}`}>{RATING_LABELS[r.rating]}</span>
                  </td>
                  <td>
                    {r.reviewer.firstName} {r.reviewer.lastName}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  </td>
                  <td>
                    {r.status === 'SUBMITTED' && (
                      <button
                        className="btn btn-ghost"
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, 'acknowledge')}
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canViewTeam && (
        <section className="panel">
          <div className="page-head row">
            <h2 style={{ margin: 0 }}>Team reviews</h2>
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
                  <th>Period</th>
                  <th>Rating</th>
                  <th>Status</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {!rows && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="muted">
                      No reviews found.
                    </td>
                  </tr>
                )}
                {rows?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.user.lastName}, {r.user.firstName}
                    </td>
                    <td>
                      {fmt(r.periodStart)} – {fmt(r.periodEnd)}
                    </td>
                    <td>
                      <span className={`badge ${RATING_BADGE[r.rating]}`}>{RATING_LABELS[r.rating]}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                    </td>
                    {canManage && (
                      <td>
                        {r.status === 'DRAFT' && (
                          <button
                            className="btn btn-ghost"
                            disabled={busyId === r.id}
                            onClick={() => act(r.id, 'submit')}
                          >
                            Submit
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

function DraftReview({
  isOwner,
  locations,
  staff,
  filterLoc,
  onCreated,
  onError,
}: {
  isOwner: boolean;
  locations: PharmacyOpt[];
  staff: StaffOpt[];
  filterLoc: string;
  onCreated: (msg: string) => void;
  onError: (m: string | null) => void;
}) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

  const [userId, setUserId] = useState('');
  const [pharmacyId, setPharmacyId] = useState('');
  const [periodStart, setPeriodStart] = useState(toLocalDate(defaultStart));
  const [periodEnd, setPeriodEnd] = useState(toLocalDate(now));
  const [rating, setRating] = useState<Rating>('MEETS_EXPECTATIONS');
  const [strengths, setStrengths] = useState('');
  const [areasForImprovement, setAreasForImprovement] = useState('');
  const [goals, setGoals] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);

  const needsLocation = isOwner && !filterLoc;
  const valid = userId && periodStart && periodEnd && (!needsLocation || pharmacyId);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      await api('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          ...(needsLocation ? { pharmacyId } : {}),
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
          rating,
          ...(strengths.trim() ? { strengths: strengths.trim() } : {}),
          ...(areasForImprovement.trim() ? { areasForImprovement: areasForImprovement.trim() } : {}),
          ...(goals.trim() ? { goals: goals.trim() } : {}),
          ...(comments.trim() ? { comments: comments.trim() } : {}),
        }),
      });
      setStrengths('');
      setAreasForImprovement('');
      setGoals('');
      setComments('');
      onCreated('Review drafted. Submit it when ready for the employee to see.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to draft review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Draft a review</h2>
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
        <label className="field">
          Period start
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label className="field">
          Period end
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        <label className="field">
          Rating
          <select value={rating} onChange={(e) => setRating(e.target.value as Rating)}>
            {(Object.keys(RATING_LABELS) as Rating[]).map((r) => (
              <option key={r} value={r}>
                {RATING_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Strengths (optional)
          <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Areas for improvement (optional)
          <textarea value={areasForImprovement} onChange={(e) => setAreasForImprovement(e.target.value)} rows={2} />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Goals (optional)
          <textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2} />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Comments (optional)
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </section>
  );
}
