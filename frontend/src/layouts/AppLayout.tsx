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
  Leaf,
  ChevronDown,
} from 'lucide-react';
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
  ];

  const canSeeItem = (item: NavItem) => {
    if (!item.perfis) return true;
    return user ? item.perfis.includes(user.perfil) : false;
  };

  const showAdminSection = isAdminGeral || isAdminEmpresa;
  const visibleAdminItems = adminNavItems.filter(canSeeItem);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white border-r border-gray-200 w-64">
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Leaf size={16} className="text-white" />
        </div>
        <span className="font-bold text-gray-900 text-lg">LinkMe BR</span>
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

        {showAdminSection && visibleAdminItems.length > 0 && (
          <div className="pt-3">
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
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
            <p className="text-xs text-gray-500 truncate">{user?.perfil?.replace(/_/g, ' ')}</p>
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
