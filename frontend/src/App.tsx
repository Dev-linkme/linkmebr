import { Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import DashboardSiloDetalhe from './pages/DashboardSiloDetalhe';
import SilosPage from './pages/SilosPage';
import BarrasPage from './pages/BarrasPage';
import RelatoriosPage from './pages/RelatoriosPage';
import EmpresasPage from './pages/EmpresasPage';
import UsuariosPage from './pages/UsuariosPage';
import FaqAdminPage from './pages/FaqAdminPage';
import ContatosPage from './pages/ContatosPage';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
      </Route>

      {/* Protected routes — all authenticated users */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="silos/:id" element={<DashboardSiloDetalhe />} />
      </Route>

      <Route
        path="/relatorios"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RelatoriosPage />} />
      </Route>

      {/* Silos — administrador_empresa + administrador_geral */}
      <Route
        path="/silos"
        element={
          <ProtectedRoute perfis={['administrador_empresa', 'administrador_geral']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SilosPage />} />
        <Route path=":id/barras" element={<BarrasPage />} />
      </Route>

      {/* Admin — empresas: administrador_geral only */}
      <Route
        path="/admin/empresas"
        element={
          <ProtectedRoute perfis={['administrador_geral']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<EmpresasPage />} />
      </Route>

      {/* Admin — usuários: administrador_geral + administrador_empresa */}
      <Route
        path="/admin/usuarios"
        element={
          <ProtectedRoute perfis={['administrador_geral', 'administrador_empresa']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<UsuariosPage />} />
      </Route>

      {/* Admin — FAQ: administrador_geral only */}
      <Route
        path="/admin/faq"
        element={
          <ProtectedRoute perfis={['administrador_geral']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<FaqAdminPage />} />
      </Route>

      {/* Admin — contatos: administrador_geral only */}
      <Route
        path="/admin/contatos"
        element={
          <ProtectedRoute perfis={['administrador_geral']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ContatosPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
