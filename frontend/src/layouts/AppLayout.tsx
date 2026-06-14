import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Database,
  BarChart2,
  Building2,
  Users,
  HelpCircle,
  MessageSquare,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Layers,
  Activity,
  Download,
  FileCode2,
  Eye,
  Map,
  BrainCircuit,
  Sparkles,
  CalendarClock,
  Globe2,
} from 'lucide-react';
import logoImg from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  perfis?: string[];
}

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, logout, isAdminGeral, isAdminEmpresa } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [cadastrosExpanded, setCadastrosExpanded] = useState(false);
  const [esquematicosExpanded, setEsquematicosExpanded] = useState(false);
  const [iaExpanded, setIaExpanded] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success(t('nav.sair'));
    navigate('/');
  };

  const mainNavItems: NavItem[] = [
    {
      to: '/dashboard',
      label: t('nav.dashboard'),
      icon: <LayoutDashboard size={18} />,
    },
    {
      to: '/relatorios',
      label: t('nav.relatorios'),
      icon: <BarChart2 size={18} />,
    },
    {
      to: '/ia/previsao',
      label: t('nav.ia_previsao'),
      icon: <Sparkles size={18} />,
    },
    {
      to: '/exportacao',
      label: t('nav.exportacao'),
      icon: <Download size={18} />,
    },
  ];

  const adminNavItems: NavItem[] = [
    {
      to: '/admin/empresas',
      label: t('admin.empresas'),
      icon: <Building2 size={16} />,
      perfis: ['administrador_geral'],
    },
    {
      to: '/admin/usuarios',
      label: t('admin.usuarios'),
      icon: <Users size={16} />,
      perfis: ['administrador_geral', 'administrador_empresa'],
    },
    {
      to: '/admin/silos',
      label: t('nav.silos'),
      icon: <Database size={16} />,
      perfis: ['administrador_empresa'],
    },
    {
      to: '/admin/faq',
      label: t('admin.faq'),
      icon: <HelpCircle size={16} />,
      perfis: ['administrador_geral'],
    },
    {
      to: '/admin/contatos',
      label: t('admin.contatos'),
      icon: <MessageSquare size={16} />,
      perfis: ['administrador_geral'],
    },
    {
      to: '/saude-sistema',
      label: t('nav.saude_sistema'),
      icon: <Activity size={16} />,
    },
  ];

  const canSeeItem = (item: NavItem) => {
    if (!item.perfis) return true;
    return user ? item.perfis.includes(user.perfil) : false;
  };

  const cadastrosNavItems: NavItem[] = [
    {
      to: '/cadastros/empresas',
      label: t('cadastros.empresas'),
      icon: <Building2 size={16} />,
      perfis: ['administrador_geral'],
    },
    {
      to: '/cadastros/silos',
      label: t('cadastros.silos'),
      icon: <Database size={16} />,
    },
    {
      to: '/cadastros/barras',
      label: t('cadastros.barras'),
      icon: <Layers size={16} />,
    },
    {
      to: '/cadastros/sensores',
      label: t('cadastros.sensores'),
      icon: <Activity size={16} />,
    },
  ];

  const showAdminSection = isAdminGeral || isAdminEmpresa;
  const visibleAdminItems = adminNavItems.filter(canSeeItem);
  const visibleCadastrosItems = cadastrosNavItems.filter(canSeeItem);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white border-r border-gray-200 w-64">
      {/* Brand */}
      <div className="flex items-center justify-center px-5 py-4 border-b border-gray-100">
        <img src={logoImg} alt="LinkMe BR" className="h-28 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {mainNavItems.filter(canSeeItem).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={linkClass}
            onClick={() => setSidebarOpen(false)}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        {(isAdminGeral || isAdminEmpresa) && (
          <div className="pt-3">
            <button
              onClick={() => setIaExpanded(!iaExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 tracking-wider hover:text-gray-600 transition-colors"
            >
              <span className="flex items-center gap-2"><BrainCircuit size={13} />{t('nav.ia_gestao')}</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${iaExpanded ? 'rotate-180' : ''}`}
              />
            </button>
            {iaExpanded && (
              <div className="mt-1 space-y-1">
                <NavLink
                  to="/ia/treinamento-global"
                  className={({ isActive }) =>
                    `flex items-center gap-3 pl-5 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <Globe2 size={16} />{t('nav.ia_treinamento_global')}
                </NavLink>
                <NavLink
                  to="/ia/treinamento-diario"
                  className={({ isActive }) =>
                    `flex items-center gap-3 pl-5 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <CalendarClock size={16} />{t('nav.ia_treinamento_diario')}
                </NavLink>
              </div>
            )}
          </div>
        )}

        {showAdminSection && visibleAdminItems.length > 0 && (
          <div className="pt-3">
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 tracking-wider hover:text-gray-600 transition-colors"
            >
              <span>{t('nav.admin')}</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${adminExpanded ? 'rotate-180' : ''}`}
              />
            </button>
            {adminExpanded && (
              <div className="mt-1 space-y-1">
                {visibleAdminItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 pl-5 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`
                    }
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}

        {visibleCadastrosItems.length > 0 && (
          <div className="pt-3">
            <button
              onClick={() => setCadastrosExpanded(!cadastrosExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 tracking-wider hover:text-gray-600 transition-colors"
            >
              <span>{t('nav.cadastros')}</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${cadastrosExpanded ? 'rotate-180' : ''}`}
              />
            </button>
            {cadastrosExpanded && (
              <div className="mt-1 space-y-1">
                {visibleCadastrosItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 pl-5 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`
                    }
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}

                {/* Esquemáticos sub-menu */}
                <div>
                  <button
                    onClick={() => setEsquematicosExpanded(!esquematicosExpanded)}
                    className="w-full flex items-center justify-between pl-5 pr-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <FileCode2 size={16} />
                      {t('cadastros.esquematicos')}
                    </span>
                    <ChevronDown size={12} className={`transition-transform ${esquematicosExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {esquematicosExpanded && (
                    <div className="mt-0.5 space-y-0.5">
                      <NavLink
                        to="/cadastros/esquematicos"
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`
                        }
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Eye size={14} /> Visualizador
                      </NavLink>
                      <NavLink
                        to="/cadastros/esquematicos/mapeamento"
                        className={({ isActive }) =>
                          `flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`
                        }
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Map size={14} /> Mapeamento
                      </NavLink>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-primary-700">
              {user?.nome_completo?.charAt(0).toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.nome_completo}</p>
            <p className="text-xs text-gray-500 truncate">
              {user?.perfil?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
            title={t('nav.sair')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-64 flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 flex flex-col w-64">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 h-14 flex-shrink-0">
          <button
            className="md:hidden text-gray-500 hover:text-gray-900"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>

          <div className="hidden md:flex items-center text-sm text-gray-500 gap-1">
            <span className="font-medium text-gray-800">{user?.nome_completo}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">{t('nav.sair')}</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {/* Suppress unused import warning */}
      {false && <X />}
    </div>
  );
}
