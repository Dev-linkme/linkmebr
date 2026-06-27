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
import CadastrosPage from './pages/CadastrosPage';
import SaudeSistemaPage from './pages/SaudeSistemaPage';
import ExportacaoPage from './pages/ExportacaoPage';
import EsquematicoPage from './pages/EsquematicoPage';
import IaTreinamentoPage from './pages/IaTreinamentoPage';
import IaPrevisaoPage from './pages/IaPrevisaoPage';
import LabradorPage from './pages/LabradorPage';
import CarregamentosPage from './pages/CarregamentosPage';
import CarregamentosVisualizarPage from './pages/CarregamentosVisualizarPage';

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

      {/* Admin — silos: administrador_empresa only */}
      <Route
        path="/admin/silos"
        element={
          <ProtectedRoute perfis={['administrador_empresa']}>
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

      {/* Admin — Comando Remoto (Labrador): administrador_geral only */}
      <Route
        path="/admin/labrador"
        element={
          <ProtectedRoute perfis={['administrador_geral']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<LabradorPage />} />
      </Route>

      {/* Saúde do Sistema — todos os perfis autenticados */}
      <Route
        path="/saude-sistema"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SaudeSistemaPage />} />
      </Route>

      {/* Exportação — todos os perfis autenticados */}
      <Route
        path="/exportacao"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ExportacaoPage />} />
      </Route>

      {/* IA — Previsão (todos os perfis) */}
      <Route
        path="/ia/previsao"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<IaPrevisaoPage />} />
      </Route>

      {/* IA — Treinamento (administrador_empresa + administrador_geral) */}
      <Route
        path="/ia/treinamento-global"
        element={
          <ProtectedRoute perfis={['administrador_geral', 'administrador_empresa']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<IaTreinamentoPage modo="full" />} />
      </Route>

      <Route
        path="/ia/treinamento-diario"
        element={
          <ProtectedRoute perfis={['administrador_geral', 'administrador_empresa']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<IaTreinamentoPage modo="incremental" />} />
      </Route>

      <Route
        path="/ia/bootstrap"
        element={
          <ProtectedRoute perfis={['administrador_geral', 'administrador_empresa']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<IaTreinamentoPage modo="bootstrap" />} />
      </Route>

      {/* Cadastros — visualização hierárquica (todos os perfis autenticados) */}
      <Route
        path="/cadastros"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path=":nivel" element={<CadastrosPage />} />
        <Route path="esquematicos/*" element={<EsquematicoPage />} />
        <Route path="carregamentos" element={<CarregamentosPage />} />
        <Route path="carregamentos/visualizar" element={<CarregamentosVisualizarPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
