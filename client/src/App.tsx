import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { OwnerDashboard } from './pages/OwnerDashboard';
import { LocationDashboard } from './pages/LocationDashboard';
import { Patients } from './pages/Patients';
import { Inventory } from './pages/Inventory';
import { Prescriptions } from './pages/Prescriptions';
import { Compliance } from './pages/Compliance';
import { AuditLog } from './pages/AuditLog';
import { Finance } from './pages/Finance';
import { Cameras } from './pages/Cameras';
import { Admin } from './pages/Admin';

/** Landing route: owners get the consolidated overview, everyone else their location. */
function Home() {
  const { user } = useAuth();
  if (user?.role === 'SYSTEM_OWNER') {
    return (
      <Layout>
        <OwnerDashboard />
      </Layout>
    );
  }
  return <Navigate to="/location" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/location"
        element={
          <ProtectedRoute permission="dashboard:location">
            <Layout>
              <LocationDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/patients"
        element={
          <ProtectedRoute permission="patient:read">
            <Layout>
              <Patients />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prescriptions"
        element={
          <ProtectedRoute permission="prescription:read">
            <Layout>
              <Prescriptions />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute permission="inventory:read">
            <Layout>
              <Inventory />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/compliance"
        element={
          <ProtectedRoute permission="compliance:read">
            <Layout>
              <Compliance />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <Layout>
              <AuditLog />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance"
        element={
          <ProtectedRoute permission="finance:read">
            <Layout>
              <Finance />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cameras"
        element={
          <ProtectedRoute permission="camera:view">
            <Layout>
              <Cameras />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute permission="system:monitor">
            <Layout>
              <Admin />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
