import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const ROLE_LABELS: Record<string, string> = {
  SYSTEM_OWNER: 'System Owner',
  LOCATION_PARTNER: 'Location Partner',
  PHARMACIST_IN_CHARGE: 'Pharmacist-in-Charge',
  PHARMACY_TECHNICIAN: 'Pharmacy Technician',
  CASHIER: 'Cashier',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">℞</span>
          <div>
            <div className="brand-name">PharmaSuite</div>
            <div className="brand-sub">Management System</div>
          </div>
        </div>

        <nav className="nav">
          {can('dashboard:owner') && (
            <NavLink to="/" end className="nav-link">
              Owner Overview
            </NavLink>
          )}
          {can('dashboard:location') && (
            <NavLink to="/location" className="nav-link">
              My Location
            </NavLink>
          )}
          {can('patient:read') && (
            <NavLink to="/patients" className="nav-link">
              Patients
            </NavLink>
          )}
          {can('prescription:read') && (
            <NavLink to="/prescriptions" className="nav-link">
              Prescriptions
            </NavLink>
          )}
          {can('pos:sell') && (
            <NavLink to="/sales" className="nav-link">
              Point of Sale
            </NavLink>
          )}
          {can('inventory:read') && (
            <NavLink to="/inventory" className="nav-link">
              Inventory
            </NavLink>
          )}
          {can('inventory:read') && (
            <NavLink to="/transfers" className="nav-link">
              Transfers
            </NavLink>
          )}
          {can('prescription:read') && (
            <NavLink to="/prescribers" className="nav-link">
              Prescribers
            </NavLink>
          )}
          {can('narcotics:read') && (
            <NavLink to="/narcotics" className="nav-link">
              Narcotics
            </NavLink>
          )}
          {can('recall:read') && (
            <NavLink to="/recalls" className="nav-link">
              Recalls
            </NavLink>
          )}
          {can('compliance:read') && (
            <NavLink to="/compliance" className="nav-link">
              Compliance
            </NavLink>
          )}
          {can('finance:read') && (
            <NavLink to="/finance" className="nav-link">
              Finance
            </NavLink>
          )}
          {can('report:run') && (
            <NavLink to="/reports" className="nav-link">
              Reports
            </NavLink>
          )}
          {can('document:read') && (
            <NavLink to="/documents" className="nav-link">
              Documents
            </NavLink>
          )}
          {can('camera:view') && (
            <NavLink to="/cameras" className="nav-link">
              Cameras
            </NavLink>
          )}
          {(can('message:send') || can('message:broadcast')) && (
            <NavLink to="/messages" className="nav-link">
              Messages
            </NavLink>
          )}
          {can('notification:manage') && (
            <NavLink to="/notifications" className="nav-link">
              Notifications
            </NavLink>
          )}
          {can('workflow:approve') && (
            <NavLink to="/workflow" className="nav-link">
              Workflow
            </NavLink>
          )}
          {(can('audit:read:all') || can('audit:read:location')) && (
            <NavLink to="/audit" className="nav-link">
              Audit Log
            </NavLink>
          )}
          <NavLink to="/settings" className="nav-link">
            Settings
          </NavLink>
          {can('system:monitor') && (
            <NavLink to="/admin" className="nav-link">
              Administration
            </NavLink>
          )}
        </nav>

        <div className="user-box">
          <div className="user-name">
            {user?.firstName} {user?.lastName}
          </div>
          <div className="user-role">{user ? ROLE_LABELS[user.role] : ''}</div>
          {user?.pharmacy && <div className="user-loc">{user.pharmacy.name}</div>}
          <button className="btn btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
