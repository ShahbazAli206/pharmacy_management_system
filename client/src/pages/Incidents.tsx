import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import type { TranslationKey } from '../lib/i18n/translations';

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

const CATEGORY_LABEL_KEYS: Record<Category, TranslationKey> = {
  MEDICATION_ERROR: 'categoryMedicationError',
  WORKPLACE_SAFETY: 'categoryWorkplaceSafety',
  THEFT_SECURITY: 'categoryTheftSecurity',
  PATIENT_COMPLAINT: 'categoryPatientComplaint',
  EQUIPMENT_FAILURE: 'categoryEquipmentFailure',
  OTHER: 'categoryOther',
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
  const { t } = useI18n();
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
      setError(
        e instanceof ApiError
          ? e.message
          : action === 'resolve'
            ? t('failedToResolveIncident')
            : t('failedToCloseIncident'),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>{t('incidentsHeading')}</h1>
        <p className="muted">{t('incidentsSubtitle')}</p>
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
        <h2>{t('myReportsHeading')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colOccurred')}</th>
                <th>{t('colCategory')}</th>
                <th>{t('colSeverity')}</th>
                <th>{t('colStatus')}</th>
                <th>{t('colDescription')}</th>
              </tr>
            </thead>
            <tbody>
              {(!mine || mine.length === 0) && (
                <tr>
                  <td colSpan={5} className="muted">
                    {mine ? t('noIncidentsReported') : t('loading')}
                  </td>
                </tr>
              )}
              {mine?.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.occurredAt)}</td>
                  <td>{t(CATEGORY_LABEL_KEYS[r.category])}</td>
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
            <h2 style={{ margin: 0 }}>
              {t('incidentsScopeHeading', { scope: isOwner ? t('allLocationsLabel') : t('locationLabel') })}
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select">
                <option value="">{t('allStatusesOption')}</option>
                <option value="OPEN">{t('statusOpenOption')}</option>
                <option value="UNDER_REVIEW">{t('statusUnderReviewOption')}</option>
                <option value="RESOLVED">{t('statusResolvedOption')}</option>
                <option value="CLOSED">{t('statusClosedOption')}</option>
              </select>
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
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colReportedBy')}</th>
                  <th>{t('colOccurred')}</th>
                  <th>{t('colCategory')}</th>
                  <th>{t('colSeverity')}</th>
                  <th>{t('colStatus')}</th>
                  <th>{t('colDescription')}</th>
                  {canTriage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {!rows && (
                  <tr>
                    <td colSpan={canTriage ? 7 : 6} className="muted">
                      {t('loading')}
                    </td>
                  </tr>
                )}
                {rows && rows.length === 0 && (
                  <tr>
                    <td colSpan={canTriage ? 7 : 6} className="muted">
                      {t('noIncidentsFound')}
                    </td>
                  </tr>
                )}
                {rows?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.reportedBy.lastName}, {r.reportedBy.firstName}
                    </td>
                    <td>{fmt(r.occurredAt)}</td>
                    <td>{t(CATEGORY_LABEL_KEYS[r.category])}</td>
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
                            {t('resolveButton')}
                          </button>
                        )}
                        {r.status === 'RESOLVED' && (
                          <button
                            className="btn btn-ghost"
                            disabled={busyId === r.id}
                            onClick={() => act(r.id, 'close')}
                          >
                            {t('closeButton')}
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
  const { t } = useI18n();
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
      onCreated(t('incidentReportedNotice'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToReportIncident'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('reportIncidentHeading')}</h2>
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
          {t('severityLabel')}
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="LOW">{t('severityLowOption')}</option>
            <option value="MEDIUM">{t('severityMediumOption')}</option>
            <option value="HIGH">{t('severityHighOption')}</option>
            <option value="CRITICAL">{t('severityCriticalOption')}</option>
          </select>
        </label>
        <label className="field">
          {t('occurredAtLabel')}
          <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </label>
        <label className="field">
          {t('locationWithinPharmacyOptionalLabel')}
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('locationWithinPharmacyPlaceholder')} />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          {t('descriptionLabel')}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('whatHappenedPlaceholder')}
            rows={3}
          />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? t('reportingEllipsis') : t('submitReportButton')}
        </button>
      </div>
    </section>
  );
}
