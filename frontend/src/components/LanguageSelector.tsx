import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'pt-BR', label: 'PT' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
];

export default function LanguageSelector() {
  const { i18n } = useTranslation();

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('lang', code);
  };

  return (
    <div className="flex items-center gap-1">
      {LANGS.map((lang, idx) => (
        <span key={lang.code} className="flex items-center">
          <button
            onClick={() => handleChange(lang.code)}
            className={`text-sm font-medium px-1 transition-colors ${
              i18n.language === lang.code
                ? 'text-primary-600 font-bold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            aria-label={lang.label}
          >
            {lang.label}
          </button>
          {idx < LANGS.length - 1 && (
            <span className="text-gray-300 text-xs">|</span>
          )}
        </span>
      ))}
    </div>
  );
}
