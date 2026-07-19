import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';

interface Prescriber {
  id: string;
  firstName: string;
  lastName: string;
  collegeRegNumber: string;
  phone: string | null;
  fax: string | null;
  pharmacyId: string;
}

interface OwnerLocation {
  id: string;
  name: string;
  province: string;
}

interface OwnerDashboard {
  locations: OwnerLocation[];
}

export function Prescribers() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const isOwner = user?.role === 'SYSTEM_OWNER';

  const [prescribers, setPrescribers] = useState<Prescriber[]>([]);
  const [locations, setLocations] = useState<OwnerLocation[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add-form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [collegeRegNumber, setCollegeRegNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [fax, setFax] = useState('');
  const [busy, setBusy] = useState(false);

  // Owner: load the location list for the picker.
  useEffect(() => {
    if (!isOwner) return;
    api<OwnerDashboard>('/dashboard/owner')
      .then((d) => setLocations(d.locations))
      .catch(() => {});
  }, [isOwner]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = isOwner && pharmacyId ? `?pharmacyId=${pharmacyId}` : '';
      setPrescribers(await api<Prescriber[]>(`/prescribers${query}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isOwner, pharmacyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    collegeRegNumber.trim() !== '' &&
    (!isOwner || pharmacyId !== '') &&
    !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api('/prescribers', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          collegeRegNumber: collegeRegNumber.trim(),
          phone: phone.trim() || undefined,
          fax: fax.trim() || undefined,
          ...(isOwner ? { pharmacyId } : {}),
        }),
      });
      setFirstName('');
      setLastName('');
      setCollegeRegNumber('');
      setPhone('');
      setFax('');
      setNotice(t('prescriberAddedNotice'));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>{t('navPrescribers')}</h1>
        <p className="muted">{t('prescribersSubtitle')}</p>
      </header>

      {isOwner && (
        <div className="toolbar">
          <label className="field">
            {t('locationLabel')}
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              <option value="">{t('allLocationsOption')}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.province})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert" style={{ background: '#dcfce7', color: '#166534' }}>
          {notice}
        </div>
      )}

      {can('prescriber:manage') && (
        <section className="panel">
          <h2>{t('addPrescriberHeading')}</h2>
          <div className="form-grid">
            {isOwner && (
              <label className="field">
                {t('locationLabel')}
                <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
                  <option value="">{t('selectLocationPlaceholder')}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.province})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              {t('firstNameLabel')}
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
            </label>
            <label className="field">
              {t('lastNameLabel')}
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
            </label>
            <label className="field">
              {t('collegeRegNumberLabel')}
              <input
                className="mono"
                value={collegeRegNumber}
                onChange={(e) => setCollegeRegNumber(e.target.value)}
                placeholder="CPSO-12345"
              />
            </label>
            <label className="field">
              {t('phoneLabel')}
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(416) 555-0100" />
            </label>
            <label className="field">
              {t('faxLabel')}
              <input value={fax} onChange={(e) => setFax(e.target.value)} placeholder="(416) 555-0101" />
            </label>
            <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
              {busy ? t('saving') : t('addPrescriberButton')}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>{t('navPrescribers')}</h2>
        {loading ? (
          <div className="muted">{t('loading')}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('colName')}</th>
                  <th>{t('colCollegeRegNum')}</th>
                  <th>{t('phoneLabel')}</th>
                  <th>{t('faxLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {prescribers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      {t('noPrescribersFound')}
                    </td>
                  </tr>
                )}
                {prescribers.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.lastName}, {p.firstName}
                    </td>
                    <td className="mono">{p.collegeRegNumber}</td>
                    <td>{p.phone ?? <span className="muted">—</span>}</td>
                    <td>{p.fax ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
