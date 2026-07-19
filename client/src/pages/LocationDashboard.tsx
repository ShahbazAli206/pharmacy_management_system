import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Boxes, DollarSign, FileText, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatCard } from '../components/StatCard';
import { useI18n } from '../lib/i18n/I18nContext';
import { fetchLocations, type LocationOption } from '../lib/locations';
import type { LocationOverview } from '../lib/types';

const currency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

export function LocationDashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user?.role === 'SYSTEM_OWNER';
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [data, setData] = useState<LocationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    fetchLocations()
      .then((opts) => {
        setLocations(opts);
        if (opts[0]) setPharmacyId(opts[0].id);
      })
      .catch(() => {});
  }, [isOwner]);

  const ready = !isOwner || !!pharmacyId;

  const load = useCallback(() => {
    if (!ready) return;
    setData(null);
    setError(null);
    const q = isOwner && pharmacyId ? `?pharmacyId=${pharmacyId}` : '';
    api<LocationOverview>(`/dashboard/location${q}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [isOwner, pharmacyId, ready]);

  useEffect(() => {
    load();
  }, [load]);

  if (isOwner && !ready) return <div className="alert">{t('selectLocationPlaceholder')}</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="muted">{t('loadingLocationDashboard')}</div>;

  const checklistPct =
    data.complianceChecklist.total === 0
      ? 0
      : Math.round((data.complianceChecklist.completed / data.complianceChecklist.total) * 100);

  return (
    <div>
      <header className="page-head">
        <h1>{data.pharmacy.name}</h1>
        <p className="muted">
          {data.pharmacy.code} · {data.pharmacy.province}
        </p>
      </header>

      {isOwner && (
        <div className="toolbar">
          <label className="field" style={{ minWidth: 260 }}>
            {t('locationLabel')}
            <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
              {locations.length === 0 && <option value="">{t('loading')}</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="stat-grid">
        <StatCard icon={Users} label={t('statPatients')} value={data.patientCount.toLocaleString()} />
        <StatCard icon={Users} accent="blue" label={t('statStaff')} value={data.staffCount.toString()} />
        <StatCard icon={DollarSign} accent="amber" label={t('statSalesToday')} value={currency(data.salesToday)} />
        <StatCard icon={FileText} accent="purple" label={t('statPrescriptionsToday')} value={data.prescriptionsToday.toString()} />
        <StatCard icon={Boxes} accent="cyan" label={t('statReorderAlerts')} value={data.reorderAlerts.toString()} sub={t('statReorderAlertsSub')} />
        <StatCard icon={AlertTriangle} accent="rose" label={t('statActivePrescriptions')} value={data.refillsDueToday.toString()} sub={t('statActivePrescriptionsSub')} />
      </div>

      <section className="panel">
        <h2>{t('complianceChecklistHeading')}</h2>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${checklistPct}%` }} />
        </div>
        <p className="muted">
          {t('tasksCompleteCount', { completed: data.complianceChecklist.completed, total: data.complianceChecklist.total })}
          {data.complianceChecklist.total === 0 && ` — ${t('noTasksThisMonth')}`}
        </p>
      </section>
    </div>
  );
}
