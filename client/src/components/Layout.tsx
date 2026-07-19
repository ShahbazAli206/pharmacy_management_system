import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import { LOCALE_LABELS, LOCALES } from '../lib/i18n/translations';
import { GlobalSearch } from './GlobalSearch';

/** Read the current theme set on <html> (initialised by the inline script in index.html). */
function getTheme(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

const ROLE_LABEL_KEYS = {
  SYSTEM_OWNER: 'roleSystemOwner',
  LOCATION_PARTNER: 'roleLocationPartner',
  PHARMACIST_IN_CHARGE: 'rolePharmacistInCharge',
  PHARMACY_TECHNICIAN: 'rolePharmacyTechnician',
  CASHIER: 'roleCashier',
  INVENTORY_MANAGER: 'roleInventoryManager',
  ACCOUNTANT: 'roleAccountant',
} as const;

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme);
  const [searchOpen, setSearchOpen] = useState(false);
  const canSearch = can('search:global');

  useEffect(() => {
    if (!canSearch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canSearch]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('pms_theme', next);
    } catch {
      /* ignore storage errors (private mode) */
    }
    setTheme(next);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">℞</span>
          <div>
            <div className="brand-name">{t('brandName')}</div>
            <div className="brand-sub">{t('brandTagline')}</div>
          </div>
        </div>

        <nav className="nav">
          {canSearch && (
            <button
              className="nav-link"
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
              onClick={() => setSearchOpen(true)}
            >
              <span>{t('navSearch')}</span>
              <span className="muted" style={{ fontSize: 12 }}>{t('searchShortcutHint')}</span>
            </button>
          )}
          {can('dashboard:owner') && (
            <NavLink to="/" end className="nav-link">
              {t('navOwnerOverview')}
            </NavLink>
          )}
          {can('dashboard:location') && (
            <NavLink to="/location" className="nav-link">
              {t('navMyLocation')}
            </NavLink>
          )}
          {can('patient:read') && (
            <NavLink to="/patients" className="nav-link">
              {t('navPatients')}
            </NavLink>
          )}
          {can('prescription:read') && (
            <NavLink to="/prescriptions" className="nav-link">
              {t('navPrescriptions')}
            </NavLink>
          )}
          {can('pos:sell') && (
            <NavLink to="/sales" className="nav-link">
              {t('navPointOfSale')}
            </NavLink>
          )}
          {can('inventory:read') && (
            <NavLink to="/inventory" className="nav-link">
              {t('navInventory')}
            </NavLink>
          )}
          {can('inventory:read') && (
            <NavLink to="/products" className="nav-link">
              {t('navProducts')}
            </NavLink>
          )}
          {can('inventory:read') && (
            <NavLink to="/transfers" className="nav-link">
              {t('navTransfers')}
            </NavLink>
          )}
          {can('prescription:read') && (
            <NavLink to="/prescribers" className="nav-link">
              {t('navPrescribers')}
            </NavLink>
          )}
          {can('narcotics:read') && (
            <NavLink to="/narcotics" className="nav-link">
              {t('navNarcotics')}
            </NavLink>
          )}
          {can('recall:read') && (
            <NavLink to="/recalls" className="nav-link">
              {t('navRecalls')}
            </NavLink>
          )}
          {can('compliance:read') && (
            <NavLink to="/compliance" className="nav-link">
              {t('navCompliance')}
            </NavLink>
          )}
          {can('finance:read') && (
            <NavLink to="/finance" className="nav-link">
              {t('navFinance')}
            </NavLink>
          )}
          {can('report:run') && (
            <NavLink to="/reports" className="nav-link">
              {t('navReports')}
            </NavLink>
          )}
          {can('document:read') && (
            <NavLink to="/documents" className="nav-link">
              {t('navDocuments')}
            </NavLink>
          )}
          {can('camera:view') && (
            <NavLink to="/cameras" className="nav-link">
              {t('navCameras')}
            </NavLink>
          )}
          {(can('message:send') || can('message:broadcast')) && (
            <NavLink to="/messages" className="nav-link">
              {t('navMessages')}
            </NavLink>
          )}
          {can('notification:manage') && (
            <NavLink to="/notifications" className="nav-link">
              {t('navNotifications')}
            </NavLink>
          )}
          {can('workflow:approve') && (
            <NavLink to="/workflow" className="nav-link">
              {t('navWorkflow')}
            </NavLink>
          )}
          {(can('audit:read:all') || can('audit:read:location')) && (
            <NavLink to="/audit" className="nav-link">
              {t('navAuditLog')}
            </NavLink>
          )}
          {can('user:manage') && (
            <NavLink to="/staff" className="nav-link">
              {t('navStaff')}
            </NavLink>
          )}
          <NavLink to="/attendance" className="nav-link">
            {t('navAttendance')}
          </NavLink>
          <NavLink to="/scheduling" className="nav-link">
            {t('navScheduling')}
          </NavLink>
          <NavLink to="/incidents" className="nav-link">
            {t('navIncidentReports')}
          </NavLink>
          <NavLink to="/training" className="nav-link">
            {t('navTrainingCE')}
          </NavLink>
          <NavLink to="/reviews" className="nav-link">
            {t('navPerformanceReviews')}
          </NavLink>
          <NavLink to="/settings" className="nav-link">
            {t('navSettings')}
          </NavLink>
          {can('system:monitor') && (
            <NavLink to="/admin" className="nav-link">
              {t('navAdministration')}
            </NavLink>
          )}
        </nav>

        <div className="user-box">
          <div className="user-name">
            {user?.firstName} {user?.lastName}
          </div>
          <div className="user-role">{user ? t(ROLE_LABEL_KEYS[user.role as keyof typeof ROLE_LABEL_KEYS]) : ''}</div>
          {user?.pharmacy && <div className="user-loc">{user.pharmacy.name}</div>}
          <select
            className="select"
            style={{ width: '100%', marginTop: 4 }}
            value={locale}
            onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}
            aria-label="Language"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={toggleTheme}>
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>
          <button className="btn btn-ghost" onClick={handleLogout}>
            {t('signOut')}
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>

      {canSearch && <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
