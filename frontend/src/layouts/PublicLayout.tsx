import { useState } from 'react';
import { Outlet, Link as ScrollLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, Leaf } from 'lucide-react';
import LanguageSelector from '../components/LanguageSelector';
import LoginModal from '../components/LoginModal';

export default function PublicLayout() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const navLinks = [
    { href: '#sobre', label: t('nav.contato') === 'Contato' ? 'Sobre' : 'About' },
    { href: '#como-funciona', label: t('como_funciona.titulo') },
    { href: '#faq', label: t('nav.faq') },
    { href: '#contato', label: t('nav.contato') },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <a href="#" className="flex items-center gap-2 font-bold text-xl text-primary-700">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <Leaf size={16} className="text-white" />
              </div>
              LinkMe BR
            </a>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-gray-600 hover:text-primary-700 transition-colors font-medium"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-4">
              <LanguageSelector />
              <button
                onClick={() => setLoginOpen(true)}
                className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {t('nav.entrar')}
              </button>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden text-gray-600 hover:text-gray-900"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block text-sm text-gray-700 hover:text-primary-700 font-medium py-1"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <LanguageSelector />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setLoginOpen(true);
                }}
                className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {t('nav.entrar')}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Page content */}
      <div className="pt-16">
        <Outlet />
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <Leaf size={14} className="text-white" />
            </div>
            LinkMe BR
          </div>
          <p className="text-sm">
            &copy; {new Date().getFullYear()} LinkMe BR. {t('rodape.direitos')}
          </p>
          <div className="flex gap-4 text-sm">
            <a href="#sobre" className="hover:text-white transition-colors">Sobre</a>
            <a href="#contato" className="hover:text-white transition-colors">{t('nav.contato')}</a>
            <a href="#faq" className="hover:text-white transition-colors">{t('nav.faq')}</a>
          </div>
        </div>
      </footer>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* Suppress unused import warning for ScrollLink */}
      {false && <ScrollLink to="/" />}
    </div>
  );
}
