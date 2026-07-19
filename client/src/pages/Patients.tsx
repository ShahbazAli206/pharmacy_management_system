import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import { CustomFieldsEditor } from '../components/CustomFieldsEditor';
import type { CustomFieldDefinition, Paginated, Patient } from '../lib/types';

interface PharmacyOpt {
  id: string;
  name: string;
  code: string;
}

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] as const;

export function Patients() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const canWrite = can('patient:write');

  const [data, setData] = useState<Paginated<Patient> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [locations, setLocations] = useState<PharmacyOpt[]>([]);
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [editing, setEditing] = useState<Patient | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search.trim()) params.set('search', search.trim());
      setData(await api<Paginated<Patient>>(`/patients?${params.toString()}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isOwner) api<PharmacyOpt[]>('/pharmacies').then(setLocations).catch(() => {});
    api<CustomFieldDefinition[]>('/custom-fields/definitions?entityType=PATIENT').then(setDefinitions).catch(() => {});
  }, [isOwner]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <header className="page-head row">
        <div>
          <h1>{t('navPatients')}</h1>
          <p className="muted">{data ? t('recordsCount', { count: data.total }) : ' '}</p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            {t('newPatientButton')}
          </button>
        )}
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {editing && (
        <PatientForm
          patient={editing === 'new' ? null : editing}
          isOwner={isOwner}
          locations={locations}
          definitions={definitions}
          onSaved={(msg) => {
            setNotice(msg);
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
          onError={setError}
        />
      )}

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          void load();
        }}
      >
        <input
          className="search"
          placeholder={t('searchByNamePlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" type="submit">
          {t('navSearch')}
        </button>
      </form>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colName')}</th>
                <th>{t('colDob')}</th>
                <th>{t('colGender')}</th>
                <th>{t('colHealthCard')}</th>
                <th>{t('colAllergies')}</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="muted">
                    {t('loading')}
                  </td>
                </tr>
              )}
              {!loading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="muted">
                    {t('noPatientsYet')}
                  </td>
                </tr>
              )}
              {!loading &&
                data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.lastName}, {p.firstName}
                    </td>
                    <td>{new Date(p.dateOfBirth).toLocaleDateString('en-CA')}</td>
                    <td>{p.gender}</td>
                    <td className="mono">{p.healthCard ?? '—'}</td>
                    <td>
                      {p.allergies.length === 0
                        ? '—'
                        : p.allergies.map((a) => a.substance).join(', ')}
                    </td>
                    {canWrite && (
                      <td>
                        <button className="btn btn-ghost" onClick={() => setEditing(p)}>
                          {t('edit')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('previous')}
          </button>
          <span className="muted">{t('pageOf', { page, totalPages })}</span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t('next')}
          </button>
        </div>
      </section>
    </div>
  );
}

function PatientForm({
  patient,
  isOwner,
  locations,
  definitions,
  onSaved,
  onCancel,
  onError,
}: {
  patient: Patient | null;
  isOwner: boolean;
  locations: PharmacyOpt[];
  definitions: CustomFieldDefinition[];
  onSaved: (msg: string) => void;
  onCancel: () => void;
  onError: (m: string | null) => void;
}) {
  const { t } = useI18n();
  const [pharmacyId, setPharmacyId] = useState('');
  const [firstName, setFirstName] = useState(patient?.firstName ?? '');
  const [lastName, setLastName] = useState(patient?.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(patient?.dateOfBirth.slice(0, 10) ?? '');
  const [gender, setGender] = useState<(typeof GENDERS)[number]>((patient?.gender as never) ?? 'UNDISCLOSED');
  const [phone, setPhone] = useState(patient?.phone ?? '');
  const [email, setEmail] = useState(patient?.email ?? '');
  const [healthCard, setHealthCard] = useState(patient?.healthCard ?? '');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(patient?.customFields ?? {});
  const [busy, setBusy] = useState(false);

  const needsLocation = isOwner && !patient;
  const valid = firstName.trim() && lastName.trim() && dateOfBirth && (!needsLocation || pharmacyId);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      const body = {
        ...(needsLocation ? { pharmacyId } : {}),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth,
        gender,
        phone: phone.trim() || null,
        email: email.trim() || null,
        healthCard: healthCard.trim() || null,
        customFields,
      };
      if (patient) {
        await api(`/patients/${patient.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        onSaved(t('patientUpdatedNotice'));
      } else {
        await api('/patients', { method: 'POST', body: JSON.stringify(body) });
        onSaved(t('patientCreatedNotice'));
      }
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToSavePatient'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{patient ? t('editPatientHeading') : t('newPatientHeading')}</h2>
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
          {t('firstNameLabel')}
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="field">
          {t('lastNameLabel')}
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="field">
          {t('dobLabel')}
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </label>
        <label className="field">
          {t('genderLabel')}
          <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('phoneOptionalLabel')}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="field">
          {t('emailOptionalLabel')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          {t('healthCardOptionalLabel')}
          <input value={healthCard} onChange={(e) => setHealthCard(e.target.value)} />
        </label>

        <CustomFieldsEditor
          definitions={definitions}
          values={customFields}
          onChange={(key, value) => setCustomFields((prev) => ({ ...prev, [key]: value }))}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
            {busy ? t('saving') : patient ? t('saveChangesButton') : t('createPatientButton')}
          </button>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </section>
  );
}
