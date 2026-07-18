import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Gate for authenticated routes. Optionally requires a specific permission;
 * this mirrors (does not replace) the server-side RBAC — the API is still the
 * source of truth and re-checks every request.
 */
export function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const { user, loading, can } = useAuth();

  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) {
    return (
      <div className="center-screen">
        <p>You don’t have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
