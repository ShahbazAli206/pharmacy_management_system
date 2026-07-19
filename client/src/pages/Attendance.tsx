import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';

interface Shift {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
}
interface MyAttendance {
  open: Shift | null;
  recent: Shift[];
}
interface TeamRow extends Shift {
  user: { firstName: string; lastName: string; role: { name: string } };
  pharmacy: { code: string };
}

const fmt = (s: string) => new Date(s).toLocaleString('en-CA');
const duration = (inAt: string, outAt: string) => {
  const h = (new Date(outAt).getTime() - new Date(inAt).getTime()) / 3_600_000;
  return `${h.toFixed(2)} h`;
};

export function Attendance() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const canManage = can('user:manage');
  const canClock = !!user?.pharmacy; // owner has no location and doesn't clock in

  const [mine, setMine] = useState<MyAttendance | null>(null);
  const [team, setTeam] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const jobs: Promise<unknown>[] = [];
      if (canClock) jobs.push(api<MyAttendance>('/attendance/me').then(setMine));
      if (canManage) jobs.push(api<TeamRow[]>('/attendance').then(setTeam));
      await Promise.all(jobs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [canClock, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const clock = async (action: 'clock-in' | 'clock-out') => {
    setBusy(true);
    setError(null);
    try {
      await api(`/attendance/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : action === 'clock-in'
            ? t('failedToClockIn')
            : t('failedToClockOut'),
      );
    } finally {
      setBusy(false);
    }
  };

  const openShift = mine?.open ?? null;

  return (
    <div>
      <header className="page-head">
        <h1>{t('attendanceHeading')}</h1>
        <p className="muted">{t('attendanceSubtitle')}</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {canClock && (
        <section className="panel">
          <div className="page-head row">
            <div>
              <h2 style={{ margin: 0 }}>{t('myStatusHeading')}</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                {openShift
                  ? t('clockedInSinceNotice', { time: fmt(openShift.clockInAt) })
                  : t('notClockedIn')}
              </p>
            </div>
            {openShift ? (
              <button className="btn" disabled={busy} onClick={() => clock('clock-out')}>
                {busy ? '…' : t('clockOutButton')}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={() => clock('clock-in')}>
                {busy ? '…' : t('clockInButton')}
              </button>
            )}
          </div>

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colClockIn')}</th>
                  <th>{t('colClockOut')}</th>
                  <th className="num">{t('colDuration')}</th>
                </tr>
              </thead>
              <tbody>
                {(!mine || mine.recent.length === 0) && (
                  <tr>
                    <td colSpan={3} className="muted">
                      {t('noShiftsRecorded')}
                    </td>
                  </tr>
                )}
                {mine?.recent.map((s) => (
                  <tr key={s.id}>
                    <td>{fmt(s.clockInAt)}</td>
                    <td>{s.clockOutAt ? fmt(s.clockOutAt) : <span className="badge badge-ok">{t('openBadge')}</span>}</td>
                    <td className="num">{s.clockOutAt ? duration(s.clockInAt, s.clockOutAt) : t('inProgressLabel')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {canManage && (
        <section className="panel">
          <h2>{t('teamAttendanceHeading')}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colStaff')}</th>
                  <th>{t('colLocation')}</th>
                  <th>{t('colClockIn')}</th>
                  <th>{t('colClockOut')}</th>
                  <th className="num">{t('colDuration')}</th>
                </tr>
              </thead>
              <tbody>
                {!team && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {t('loading')}
                    </td>
                  </tr>
                )}
                {team && team.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {t('noAttendanceRecords')}
                    </td>
                  </tr>
                )}
                {team?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.user.lastName}, {r.user.firstName}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.pharmacy.code}</td>
                    <td>{fmt(r.clockInAt)}</td>
                    <td>{r.clockOutAt ? fmt(r.clockOutAt) : <span className="badge badge-ok">{t('openBadge')}</span>}</td>
                    <td className="num">{r.clockOutAt ? duration(r.clockInAt, r.clockOutAt) : t('inProgressLabel')}</td>
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
