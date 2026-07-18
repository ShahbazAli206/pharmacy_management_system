import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

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

const ROLE_LABELS: Record<string, string> = {
  SYSTEM_OWNER: 'System Owner',
  LOCATION_PARTNER: 'Location Partner',
  PHARMACIST_IN_CHARGE: 'Pharmacist-in-Charge',
  PHARMACY_TECHNICIAN: 'Pharmacy Technician',
  CASHIER: 'Cashier',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
};
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
      setNotice(`${u.firstName} ${u.lastName} ${u.isActive ? 'deactivated' : 'reactivated'}.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>Staff</h1>
        <p className="muted">Manage staff accounts, roles, and access</p>
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
          <h2 style={{ margin: 0 }}>Team</h2>
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
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                {isOwner && <th>Location</th>}
                <th>License</th>
                <th>Last login</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!rows && (
                <tr>
                  <td colSpan={isOwner ? 8 : 7} className="muted">
                    Loading staff…
                  </td>
                </tr>
              )}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 8 : 7} className="muted">
                    No staff found.
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
                      {self && <span className="badge badge-muted" style={{ marginLeft: 6 }}>you</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                    <td>{ROLE_LABELS[u.role.name] ?? u.role.name}</td>
                    {isOwner && <td>{u.pharmacy ? u.pharmacy.code : '—'}</td>}
                    <td className="mono" style={{ fontSize: 12 }}>{u.licenseNumber ?? '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{fmtDate(u.lastLoginAt)}</td>
                    <td>
                      <span className={`badge ${u.isActive ? 'badge-ok' : 'badge-muted'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {canToggle && (
                        <button
                          className="btn btn-ghost"
                          disabled={busyId === u.id}
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
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
      onCreated('Staff account created.');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Failed to create staff');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Add staff</h2>
      <div className="form-grid">
        <label className="field">
          First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
        </label>
        <label className="field">
          Last name
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
        </label>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@pharmacy.ca" />
        </label>
        <label className="field">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
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
          Temporary password
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min 8 characters"
          />
        </label>
        <label className="field">
          License # (optional)
          <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="OCP-123456" />
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
          {busy ? 'Creating…' : 'Add staff'}
        </button>
      </div>
    </section>
  );
}
