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
          {can('inventory:read') && (
            <NavLink to="/inventory" className="nav-link">
              Inventory
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
          {can('camera:view') && (
            <NavLink to="/cameras" className="nav-link">
              Cameras
            </NavLink>
          )}
          {(can('audit:read:all') || can('audit:read:location')) && (
            <NavLink to="/audit" className="nav-link">
              Audit Log
            </NavLink>
          )}
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
