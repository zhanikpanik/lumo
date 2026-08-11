import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';

export function AuthGate() {
  const { isAuthenticated, loading, membershipLoading, venueId, authError, signOut } = useAuth();
  const location = useLocation();

  if (loading || (isAuthenticated && membershipLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Загрузка…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!venueId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Нет доступа к заведению</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {authError?.message ?? 'Обратитесь к владельцу или менеджеру для назначения доступа.'}
          </p>
        </div>
        <button type="button" onClick={() => void signOut()} className="text-sm underline">
          Выйти
        </button>
      </div>
    );
  }

  return <Outlet />;
}
