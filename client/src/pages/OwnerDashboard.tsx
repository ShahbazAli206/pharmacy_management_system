import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, DollarSign, FileText, Users } from 'lucide-react';
import { api } from '../lib/api';
import { StatCard } from '../components/StatCard';
import { useI18n } from '../lib/i18n/I18nContext';
import type { OwnerOverview } from '../lib/types';

const currency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

export function OwnerDashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OwnerOverview>('/dashboard/owner')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="muted">{t('loadingOverview')}</div>;

  return (
    <div>
      <header className="page-head">
        <h1>{t('navOwnerOverview')}</h1>
        <p className="muted">{t('ownerOverviewSubtitle')}</p>
      </header>

      <div className="stat-grid">
        <StatCard icon={Building2} accent="blue" label={t('statLocations')} value={`${data.totals.activeLocations}/${data.totals.locations}`} sub={t('statLocationsSub')} />
        <StatCard icon={Users} label={t('statStaff')} value={data.totals.staff.toString()} />
        <StatCard icon={Users} label={t('statPatients')} value={data.totals.patients.toLocaleString()} />
        <StatCard icon={DollarSign} accent="amber" label={t('statRevenueToday')} value={currency(data.totals.revenueToday)} sub={t('statRevenueTodaySub')} />
        <StatCard icon={FileText} accent="purple" label={t('statPrescriptionsToday')} value={data.totals.prescriptionsToday.toString()} />
        <StatCard icon={AlertTriangle} accent="rose" label={t('statPendingReports')} value={data.pendingPartnerReports.toString()} />
      </div>

      <section className="panel">
        <h2>{t('statLocations')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('colCode')}</th>
                <th>{t('colName')}</th>
                <th>{t('colProvince')}</th>
                <th>{t('colStatus')}</th>
                <th className="num">{t('statStaff')}</th>
                <th className="num">{t('statPatients')}</th>
                <th>{t('colAlerts')}</th>
                <th>{t('navCompliance')}</th>
              </tr>
            </thead>
            <tbody>
              {data.locations.map((loc) => (
                <tr key={loc.id}>
                  <td className="mono">{loc.code}</td>
                  <td>{loc.name}</td>
                  <td>{loc.province}</td>
                  <td>
                    <span className={`badge ${loc.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>
                      {loc.status}
                    </span>
                  </td>
                  <td className="num">{loc.staffCount}</td>
                  <td className="num">{loc.patientCount}</td>
                  <td>
                    {loc.lowStockAlerts + loc.expiryAlerts === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="badge badge-warn">
                        {loc.lowStockAlerts} low · {loc.expiryAlerts} exp
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`dot dot-${loc.complianceStatus.toLowerCase()}`} />
                    {loc.complianceStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
