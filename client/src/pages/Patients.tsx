import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
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
          <h1>Patients</h1>
          <p className="muted">{data ? `${data.total} record(s)` : ' '}</p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + New patient
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
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>DOB</th>
                <th>Gender</th>
                <th>Health card</th>
                <th>Allergies</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="muted">
                    No patients yet.
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
                          Edit
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
            Previous
          </button>
          <span className="muted">
            Page {page} of {totalPages}
          </span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
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
        onSaved('Patient updated.');
      } else {
        await api('/patients', { method: 'POST', body: JSON.stringify(body) });
        onSaved('Patient created.');
      }
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to save patient');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{patient ? 'Edit patient' : 'New patient'}</h2>
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
          First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="field">
          Last name
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="field">
          Date of birth
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </label>
        <label className="field">
          Gender
          <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="field">
          Email (optional)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Health card (optional)
          <input value={healthCard} onChange={(e) => setHealthCard(e.target.value)} />
        </label>

        <CustomFieldsEditor
          definitions={definitions}
          values={customFields}
          onChange={(key, value) => setCustomFields((prev) => ({ ...prev, [key]: value }))}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
            {busy ? 'Saving…' : patient ? 'Save changes' : 'Create patient'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
