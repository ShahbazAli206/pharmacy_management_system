import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';

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

interface ShiftRow {
  id: string;
  startAt: string;
  endAt: string;
  role: string | null;
  notes: string | null;
  status: 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED';
  user: { id: string; firstName: string; lastName: string; role: { name: string } };
}

interface MyShift {
  id: string;
  startAt: string;
  endAt: string;
  role: string | null;
  status: 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED';
}

const fmt = (s: string) => new Date(s).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function Scheduling() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const canManage = can('shift:write');
  const canViewTeam = can('shift:read');

  const [locations, setLocations] = useState<PharmacyOpt[]>([]);
  const [filterLoc, setFilterLoc] = useState('');
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [mine, setMine] = useState<MyShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (isOwner) api<PharmacyOpt[]>('/pharmacies').then(setLocations).catch(() => {});
  }, [isOwner]);

  const load = useCallback(async () => {
    try {
      const jobs: Promise<unknown>[] = [api<MyShift[]>('/scheduling/shifts/me').then(setMine)];
      if (canViewTeam) {
        const q = isOwner && filterLoc ? `?pharmacyId=${filterLoc}` : '';
        jobs.push(api<ShiftRow[]>(`/scheduling/shifts${q}`).then(setRows));
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

  const act = async (id: string, action: 'publish' | 'cancel') => {
    setBusyId(id);
    setError(null);
    try {
      await api(`/scheduling/shifts/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : action === 'publish'
            ? t('failedToPublishShift')
            : t('failedToCancelShift'),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>{t('schedulingHeading')}</h1>
        <p className="muted">{t('schedulingSubtitle')}</p>
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel">
        <h2>{t('myUpcomingShiftsHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colStart')}</th>
                <th>{t('colEnd')}</th>
                <th>{t('colRole')}</th>
                <th>{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {(!mine || mine.length === 0) && (
                <tr>
                  <td colSpan={4} className="muted">
                    {mine ? t('noUpcomingShifts') : t('loading')}
                  </td>
                </tr>
              )}
              {mine?.map((s) => (
                <tr key={s.id}>
                  <td>{fmt(s.startAt)}</td>
                  <td>{fmt(s.endAt)}</td>
                  <td>{s.role ?? '—'}</td>
                  <td>
                    <span className={`badge ${s.status === 'PUBLISHED' ? 'badge-ok' : 'badge-muted'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && (
        <AddShift
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

      {canViewTeam && (
        <section className="panel">
          <div className="page-head row">
            <h2 style={{ margin: 0 }}>{t('teamScheduleHeading')}</h2>
            {isOwner && (
              <select value={filterLoc} onChange={(e) => setFilterLoc(e.target.value)} className="select">
                <option value="">{t('allLocationsLabel')}</option>
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
                  <th>{t('colStaff')}</th>
                  <th>{t('colStart')}</th>
                  <th>{t('colEnd')}</th>
                  <th>{t('colRole')}</th>
                  <th>{t('colStatus')}</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {!rows && (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="muted">
                      {t('loading')}
                    </td>
                  </tr>
                )}
                {rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="muted">
                      {t('noShiftsScheduled')}
                    </td>
                  </tr>
                )}
                {rows?.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.user.lastName}, {s.user.firstName}
                    </td>
                    <td>{fmt(s.startAt)}</td>
                    <td>{fmt(s.endAt)}</td>
                    <td>{s.role ?? '—'}</td>
                    <td>
                      <span className={`badge ${s.status === 'PUBLISHED' ? 'badge-ok' : 'badge-muted'}`}>
                        {s.status}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        {s.status === 'SCHEDULED' && (
                          <button
                            className="btn btn-ghost"
                            disabled={busyId === s.id}
                            onClick={() => act(s.id, 'publish')}
                          >
                            {t('publishButton')}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          disabled={busyId === s.id}
                          onClick={() => act(s.id, 'cancel')}
                        >
                          {t('cancel')}
                        </button>
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

function AddShift({
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
  const { t } = useI18n();
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60 * 60 * 1000);
  const defaultEnd = new Date(defaultStart.getTime() + 8 * 60 * 60 * 1000);

  const [userId, setUserId] = useState('');
  const [pharmacyId, setPharmacyId] = useState('');
  const [startAt, setStartAt] = useState(toLocalInput(defaultStart));
  const [endAt, setEndAt] = useState(toLocalInput(defaultEnd));
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const needsLocation = isOwner && !filterLoc;
  const valid = userId && startAt && endAt && (!needsLocation || pharmacyId);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      await api('/scheduling/shifts', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          ...(needsLocation ? { pharmacyId } : {}),
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          ...(role.trim() ? { role: role.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      setRole('');
      setNotes('');
      onCreated(t('shiftScheduledNotice'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToScheduleShift'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('scheduleShiftHeading')}</h2>
      <div className="form-grid">
        {needsLocation && (
          <label className="field">
            {t('locationLabel')}
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              <option value="">{t('selectLocationPlaceholder')}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          {t('staffMemberLabel')}
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{t('selectStaffPlaceholder')}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.lastName}, {s.firstName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('colStart')}
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </label>
        <label className="field">
          {t('colEnd')}
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </label>
        <label className="field">
          {t('roleStationOptionalLabel')}
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t('rolePlaceholderPharmacist')} />
        </label>
        <label className="field">
          {t('notesOptionalLabel')}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholderCoveringLunch')} />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? t('schedulingEllipsis') : t('scheduleShiftButton')}
        </button>
      </div>
    </section>
  );
}
