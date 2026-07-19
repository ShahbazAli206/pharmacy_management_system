import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import type { TranslationKey } from '../lib/i18n/translations';

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

const CATEGORY_LABEL_KEYS: Record<Category, TranslationKey> = {
  CONTINUING_EDUCATION: 'categoryContinuingEducation',
  CERTIFICATION: 'categoryCertification',
  ORIENTATION: 'categoryOrientation',
  SAFETY: 'categorySafety',
  OTHER: 'categoryOther',
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
  const { t } = useI18n();
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
        <h1>{t('trainingHeading')}</h1>
        <p className="muted">{t('trainingSubtitle')}</p>
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
          <h2>{t('expiringSoonHeading')}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colStaff')}</th>
                  <th>{t('colCredential')}</th>
                  <th>{t('colLocation')}</th>
                  <th>{t('colExpires')}</th>
                  <th>{t('colStatus')}</th>
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
                        {r.bucket === 'EXPIRED' ? t('expiredBadge') : t('daysBadge', { days: r.bucket })}
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
        <h2>{t('myTrainingHistoryHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colCompleted')}</th>
                <th>{t('colTitle')}</th>
                <th>{t('colCategory')}</th>
                <th>{t('colProvider')}</th>
                <th className="num">{t('colHours')}</th>
                <th>{t('colExpires')}</th>
              </tr>
            </thead>
            <tbody>
              {(!mine || mine.length === 0) && (
                <tr>
                  <td colSpan={6} className="muted">
                    {mine ? t('noTrainingRecordsYet') : t('loading')}
                  </td>
                </tr>
              )}
              {mine?.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.completedAt)}</td>
                  <td>{r.title}</td>
                  <td>{t(CATEGORY_LABEL_KEYS[r.category])}</td>
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
            <h2 style={{ margin: 0 }}>{t('teamTrainingRecordsHeading')}</h2>
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
                  <th>{t('colCompleted')}</th>
                  <th>{t('colTitle')}</th>
                  <th>{t('colCategory')}</th>
                  <th className="num">{t('colHours')}</th>
                  <th>{t('colExpires')}</th>
                </tr>
              </thead>
              <tbody>
                {!rows && (
                  <tr>
                    <td colSpan={6} className="muted">
                      {t('loading')}
                    </td>
                  </tr>
                )}
                {rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      {t('noTrainingRecordsFound')}
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
                    <td>{t(CATEGORY_LABEL_KEYS[r.category])}</td>
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
  const { t } = useI18n();
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
      onLogged(t('trainingRecordLoggedNotice'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToLogTrainingRecord'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('logTrainingRecordHeading')}</h2>
      <div className="form-grid">
        {canManage && (
          <label className="field">
            {t('whoIsThisForLabel')}
            <select value={onBehalf ? 'other' : 'me'} onChange={(e) => setOnBehalf(e.target.value === 'other')}>
              <option value="me">{t('myselfOption')}</option>
              <option value="other">{t('anotherStaffMemberOption')}</option>
            </select>
          </label>
        )}
        {onBehalf && (
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
        )}
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
          {t('titleLabel')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('trainingTitlePlaceholder')} />
        </label>
        <label className="field">
          {t('categoryLabel')}
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {(Object.keys(CATEGORY_LABEL_KEYS) as Category[]).map((c) => (
              <option key={c} value={c}>
                {t(CATEGORY_LABEL_KEYS[c])}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('providerOptionalLabel')}
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={t('providerPlaceholder')} />
        </label>
        <label className="field">
          {t('creditHoursOptionalLabel')}
          <input type="number" min="0" step="0.5" value={creditHours} onChange={(e) => setCreditHours(e.target.value)} />
        </label>
        <label className="field">
          {t('completedOnLabel')}
          <input type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
        </label>
        <label className="field">
          {t('expiresOnOptionalLabel')}
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? t('loggingEllipsis') : t('logRecordButton')}
        </button>
      </div>
    </section>
  );
}
