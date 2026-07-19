import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';

interface PharmacyOpt {
  id: string;
  name: string;
  code: string;
}

interface StaffRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  lastLoginAt: string | null;
  role: { name: string };
  pharmacy: { id: string; name: string; code: string } | null;
}

function useRoleLabels() {
  const { t } = useI18n();
  const labels: Record<string, string> = {
    SYSTEM_OWNER: t('roleSystemOwner'),
    LOCATION_PARTNER: t('roleLocationPartner'),
    PHARMACIST_IN_CHARGE: t('rolePharmacistInCharge'),
    PHARMACY_TECHNICIAN: t('rolePharmacyTechnician'),
    CASHIER: t('roleCashier'),
    INVENTORY_MANAGER: t('roleInventoryManager'),
    ACCOUNTANT: t('roleAccountant'),
  };
  return labels;
}
const NON_OWNER_ROLES = [
  'LOCATION_PARTNER',
  'PHARMACIST_IN_CHARGE',
  'PHARMACY_TECHNICIAN',
  'CASHIER',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
];

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-CA') : '—');

export function Staff() {
  const { user } = useAuth();
  const { t } = useI18n();
  const roleLabels = useRoleLabels();
  const isOwner = user?.role === 'SYSTEM_OWNER';

  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [locations, setLocations] = useState<PharmacyOpt[]>([]);
  const [filterLoc, setFilterLoc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = isOwner && filterLoc ? `?pharmacyId=${filterLoc}` : '';
      setRows(await api<StaffRow[]>(`/users${q}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [isOwner, filterLoc]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isOwner) api<PharmacyOpt[]>('/pharmacies').then(setLocations).catch(() => {});
  }, [isOwner]);

  const toggleActive = async (u: StaffRow) => {
    setBusyId(u.id);
    setError(null);
    setNotice(null);
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !u.isActive }) });
      const name = `${u.firstName} ${u.lastName}`;
      setNotice(u.isActive ? t('staffDeactivatedNotice', { name }) : t('staffReactivatedNotice', { name }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('updateFailedFallback'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>{t('staffHeading')}</h1>
        <p className="muted">{t('staffSubtitle')}</p>
      </header>

      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <AddStaff
        isOwner={isOwner}
        locations={locations}
        onCreated={(m) => {
          setNotice(m);
          void load();
        }}
        onError={setError}
      />

      <section className="panel">
        <div className="page-head row">
          <h2 style={{ margin: 0 }}>{t('teamHeading')}</h2>
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
                <th>{t('colName')}</th>
                <th>{t('colEmail')}</th>
                <th>{t('roleLabel')}</th>
                {isOwner && <th>{t('colLocation')}</th>}
                <th>{t('colLicense')}</th>
                <th>{t('colLastLogin')}</th>
                <th>{t('colStatus')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!rows && (
                <tr>
                  <td colSpan={isOwner ? 8 : 7} className="muted">
                    {t('loadingStaff')}
                  </td>
                </tr>
              )}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 8 : 7} className="muted">
                    {t('noStaffFound')}
                  </td>
                </tr>
              )}
              {rows?.map((u) => {
                const self = u.id === user?.id;
                const canToggle = !self && !(u.role.name === 'SYSTEM_OWNER' && !isOwner);
                return (
                  <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <td>
                      {u.lastName}, {u.firstName}
                      {self && <span className="badge badge-muted" style={{ marginLeft: 6 }}>{t('youBadge')}</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                    <td>{roleLabels[u.role.name] ?? u.role.name}</td>
                    {isOwner && <td>{u.pharmacy ? u.pharmacy.code : '—'}</td>}
                    <td className="mono" style={{ fontSize: 12 }}>{u.licenseNumber ?? '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{fmtDate(u.lastLoginAt)}</td>
                    <td>
                      <span className={`badge ${u.isActive ? 'badge-ok' : 'badge-muted'}`}>
                        {u.isActive ? t('activeBadge') : t('inactiveBadge')}
                      </span>
                    </td>
                    <td>
                      {canToggle && (
                        <button
                          className="btn btn-ghost"
                          disabled={busyId === u.id}
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? t('deactivateButton') : t('reactivateButton')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AddStaff({
  isOwner,
  locations,
  onCreated,
  onError,
}: {
  isOwner: boolean;
  locations: PharmacyOpt[];
  onCreated: (msg: string) => void;
  onError: (m: string | null) => void;
}) {
  const { t } = useI18n();
  const roleLabels = useRoleLabels();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('PHARMACY_TECHNICIAN');
  const [password, setPassword] = useState('');
  const [pharmacyId, setPharmacyId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const roleOptions = isOwner ? [...NON_OWNER_ROLES, 'SYSTEM_OWNER'] : NON_OWNER_ROLES;
  const needsLocation = isOwner && role !== 'SYSTEM_OWNER';
  const valid =
    email.trim() &&
    firstName.trim() &&
    lastName.trim() &&
    password.length >= 8 &&
    (!needsLocation || pharmacyId);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    onError(null);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
          password,
          ...(needsLocation ? { pharmacyId } : {}),
          ...(licenseNumber.trim() ? { licenseNumber: licenseNumber.trim() } : {}),
        }),
      });
      setEmail('');
      setFirstName('');
      setLastName('');
      setPassword('');
      setLicenseNumber('');
      onCreated(t('staffAccountCreatedNotice'));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t('failedToCreateStaff'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('addStaffHeading')}</h2>
      <div className="form-grid">
        <label className="field">
          {t('firstNameLabel')}
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t('firstNamePlaceholder')} />
        </label>
        <label className="field">
          {t('lastNameLabel')}
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t('lastNamePlaceholder')} />
        </label>
        <label className="field">
          {t('emailLabel')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} />
        </label>
        <label className="field">
          {t('roleLabel')}
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
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
          {t('temporaryPasswordLabel')}
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('passwordHintPlaceholder')}
          />
        </label>
        <label className="field">
          {t('licenseNumberOptionalLabel')}
          <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder={t('licenseNumberPlaceholder')} />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? t('creatingEllipsis') : t('addStaffButton')}
        </button>
      </div>
    </section>
  );
}
