import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireRole?: 'admin' | 'provider';
}

export function ProtectedRoute({ children, requireRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Laddar...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    // Not logged in, redirect to login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile.is_active) {
    // Account is inactive
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Kontot är inaktiverat</h1>
          <p className="text-slate-600 mb-6">
            Ditt konto har inaktiverats. Kontakta administratören för mer information.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Tillbaka till startsidan
          </button>
        </div>
      </div>
    );
  }

  // Allow admins to access provider routes
  if (requireRole === 'provider' && profile.role === 'admin') {
    // Admin can access provider pages to view as any provider
    return <>{children}</>;
  }

  if (requireRole && profile.role !== requireRole) {
    // User doesn't have required role
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⛔</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Åtkomst nekad</h1>
          <p className="text-slate-600 mb-6">
            Du har inte behörighet att komma åt denna sida.
          </p>
          <button
            onClick={() => window.location.href = profile.role === 'admin' ? '/admin' : '/provider/dashboard'}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Gå till min dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
