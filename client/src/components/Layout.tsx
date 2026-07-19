import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Award,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Calendar,
  Camera as CameraIcon,
  ClipboardCheck,
  Clock,
  DollarSign,
  FileText,
  FolderOpen,
  GitPullRequest,
  GraduationCap,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Package,
  Pill,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Sun,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n/I18nContext';
import { LOCALE_LABELS, LOCALES, type TranslationKey } from '../lib/i18n/translations';
import { GlobalSearch } from './GlobalSearch';

interface NavItem {
  to: string;
  end?: boolean;
  labelKey: TranslationKey;
  icon: LucideIcon;
  visible: boolean;
}

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

  const navItems: NavItem[] = [
    { to: '/', end: true, labelKey: 'navOwnerOverview', icon: Building2, visible: can('dashboard:owner') },
    { to: '/location', labelKey: 'navMyLocation', icon: MapPin, visible: can('dashboard:location') },
    { to: '/patients', labelKey: 'navPatients', icon: Users, visible: can('patient:read') },
    { to: '/prescriptions', labelKey: 'navPrescriptions', icon: FileText, visible: can('prescription:read') },
    { to: '/sales', labelKey: 'navPointOfSale', icon: ShoppingCart, visible: can('pos:sell') },
    { to: '/inventory', labelKey: 'navInventory', icon: Package, visible: can('inventory:read') },
    { to: '/products', labelKey: 'navProducts', icon: Boxes, visible: can('inventory:read') },
    { to: '/transfers', labelKey: 'navTransfers', icon: ArrowLeftRight, visible: can('inventory:read') },
    { to: '/prescribers', labelKey: 'navPrescribers', icon: Stethoscope, visible: can('prescription:read') },
    { to: '/narcotics', labelKey: 'navNarcotics', icon: Pill, visible: can('narcotics:read') },
    { to: '/recalls', labelKey: 'navRecalls', icon: AlertTriangle, visible: can('recall:read') },
    { to: '/compliance', labelKey: 'navCompliance', icon: ClipboardCheck, visible: can('compliance:read') },
    { to: '/finance', labelKey: 'navFinance', icon: DollarSign, visible: can('finance:read') },
    { to: '/reports', labelKey: 'navReports', icon: BarChart3, visible: can('report:run') },
    { to: '/documents', labelKey: 'navDocuments', icon: FolderOpen, visible: can('document:read') },
    { to: '/cameras', labelKey: 'navCameras', icon: CameraIcon, visible: can('camera:view') },
    { to: '/messages', labelKey: 'navMessages', icon: MessageSquare, visible: can('message:send') || can('message:broadcast') },
    { to: '/notifications', labelKey: 'navNotifications', icon: Bell, visible: can('notification:manage') },
    { to: '/workflow', labelKey: 'navWorkflow', icon: GitPullRequest, visible: can('workflow:approve') },
    { to: '/audit', labelKey: 'navAuditLog', icon: ScrollText, visible: can('audit:read:all') || can('audit:read:location') },
    { to: '/staff', labelKey: 'navStaff', icon: UserCog, visible: can('user:manage') },
    { to: '/attendance', labelKey: 'navAttendance', icon: Clock, visible: true },
    { to: '/scheduling', labelKey: 'navScheduling', icon: Calendar, visible: true },
    { to: '/incidents', labelKey: 'navIncidentReports', icon: AlertCircle, visible: true },
    { to: '/training', labelKey: 'navTrainingCE', icon: GraduationCap, visible: true },
    { to: '/reviews', labelKey: 'navPerformanceReviews', icon: Award, visible: true },
    { to: '/settings', labelKey: 'navSettings', icon: SettingsIcon, visible: true },
    { to: '/admin', labelKey: 'navAdministration', icon: ShieldCheck, visible: can('system:monitor') },
  ];

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
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Search size={18} />
                {t('navSearch')}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>{t('searchShortcutHint')}</span>
            </button>
          )}
          {navItems.filter((item) => item.visible).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
              <item.icon size={18} />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
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
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>
          <button className="btn btn-ghost" onClick={handleLogout}>
            <LogOut size={16} />
            {t('signOut')}
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>

      {canSearch && <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
