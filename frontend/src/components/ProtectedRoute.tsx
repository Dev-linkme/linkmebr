import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  perfis?: string[];
  children: ReactNode;
}

export default function ProtectedRoute({ perfis, children }: Props) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (perfis && perfis.length > 0 && user && !perfis.includes(user.perfil)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
