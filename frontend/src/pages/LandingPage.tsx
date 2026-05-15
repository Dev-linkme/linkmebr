import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Thermometer,
  Droplets,
  Wind,
  BarChart2,
  Bell,
  FileText,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  Cpu,
  Wifi,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import type { Faq } from '../types/index.ts';

interface ContatoForm {
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  mensagem: string;
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('pt') ? 'pt' : i18n.language === 'es' ? 'es' : 'en';

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [loadingFaq, setLoadingFaq] = useState(true);

  const [form, setForm] = useState<ContatoForm>({
    nome: '',
    empresa: '',
    email: '',
    telefone: '',
    mensagem: '',
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoadingFaq(true);
    api
      .get<{ data: Faq[]; lang: string }>(`/faq?lang=${lang}&status=publicado`)
      .then((res) => setFaqs(res.data.data ?? []))
      .catch(() => setFaqs([]))
      .finally(() => setLoadingFaq(false));
  }, [lang]);

  const getFaqPergunta = (faq: Faq) => {
    if (lang === 'pt') return faq.pergunta_pt;
    if (lang === 'es') return faq.pergunta_es;
    return faq.pergunta_en;
  };

  const getFaqResposta = (faq: Faq) => {
    if (lang === 'pt') return faq.resposta_pt;
    if (lang === 'es') return faq.resposta_es;
    return faq.resposta_en;
  };

  const handleContatoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.email || !form.mensagem) {
      toast.error(t('erros.campo_obrigatorio'));
      return;
    }
    setSending(true);
    try {
      await api.post('/contato', form);
      toast.success(t('contato_section.sucesso'));
      setForm({ nome: '', empresa: '', email: '', telefone: '', mensagem: '' });
    } catch {
      toast.error(t('contato_section.erro'));
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition bg-white';

  return (
    <div className="bg-white">
      {/* ───────────── HERO ───────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.15),transparent_70%)]" />
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-6 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              IoT + Inteligência Artificial
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
              {t('hero.headline')}
            </h1>
            <p className="text-lg sm:text-xl text-primary-100 mb-10 max-w-2xl leading-relaxed">
              {t('hero.subtitulo')}
            </p>

            <div className="flex flex-wrap gap-4">
              <a
                href="#contato"
                className="inline-flex items-center gap-2 bg-white text-primary-800 font-bold px-6 py-3 rounded-xl hover:bg-primary-50 transition-colors shadow-lg"
              >
                <Send size={18} />
                {t('hero.cta')}
              </a>
              <a
                href="#como-funciona"
                className="inline-flex items-center gap-2 border border-white/40 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                {t('como_funciona.titulo')}
              </a>
            </div>
          </div>
        </div>

        {/* Sensor cards floating */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden xl:flex flex-col gap-3">
          {[
            { icon: <Thermometer size={20} />, label: 'Temperatura', value: '28.4°C', color: 'text-orange-400' },
            { icon: <Droplets size={20} />, label: 'Umidade', value: '13.2%', color: 'text-blue-400' },
            { icon: <Wind size={20} />, label: 'CO₂', value: '412 ppm', color: 'text-green-400' },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3 flex items-center gap-3 text-white w-44"
            >
              <span className={card.color}>{card.icon}</span>
              <div>
                <p className="text-xs text-white/60">{card.label}</p>
                <p className="text-sm font-bold">{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────── SOBRE ───────────── */}
      <section id="sobre" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{t('sobre.titulo')}</h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">{t('sobre.descricao')}</p>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Silos monitorados', value: '2.400+' },
                  { label: 'Empresas clientes', value: '180+' },
                  { label: 'Leituras/dia', value: '1.2M+' },
                  { label: 'Disponibilidade', value: '99.9%' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-primary-50 rounded-xl p-4 text-center">
                    <p className="text-2xl font-extrabold text-primary-700">{stat.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 text-white">
                <Wifi size={40} className="mb-4 text-primary-200" />
                <h3 className="text-xl font-bold mb-2">Conectado ao campo</h3>
                <p className="text-primary-100 text-sm leading-relaxed">
                  Sensores industriais de alta precisão instalados diretamente nas barras de
                  termometria, integrados via LoRaWAN ao nosso servidor em nuvem para
                  monitoramento contínuo em qualquer localidade do Brasil.
                </p>
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-primary-100 rounded-2xl -z-10" />
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary-50 rounded-xl -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── COMO FUNCIONA ───────────── */}
      <section id="como-funciona" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">{t('como_funciona.titulo')}</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Em três etapas simples, seu estoque de grãos fica protegido 24 horas por dia.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: <Thermometer size={32} />,
                title: t('como_funciona.passo1_titulo'),
                desc: t('como_funciona.passo1_desc'),
                color: 'bg-blue-500',
              },
              {
                step: '02',
                icon: <Cpu size={32} />,
                title: t('como_funciona.passo2_titulo'),
                desc: t('como_funciona.passo2_desc'),
                color: 'bg-purple-500',
              },
              {
                step: '03',
                icon: <AlertTriangle size={32} />,
                title: t('como_funciona.passo3_titulo'),
                desc: t('como_funciona.passo3_desc'),
                color: 'bg-primary-600',
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gray-200 -translate-x-4 z-0" />
                )}
                <div className="relative z-10 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                  <div
                    className={`w-14 h-14 ${item.color} rounded-2xl flex items-center justify-center text-white mb-5`}
                  >
                    {item.icon}
                  </div>
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                    Passo {item.step}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mt-1 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── FUNCIONALIDADES ───────────── */}
      <section id="funcionalidades" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">{t('funcionalidades.titulo')}</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <BarChart2 size={28} />,
                title: t('funcionalidades.f1_titulo'),
                desc: t('funcionalidades.f1_desc'),
                color: 'text-blue-600 bg-blue-50',
              },
              {
                icon: <Bell size={28} />,
                title: t('funcionalidades.f2_titulo'),
                desc: t('funcionalidades.f2_desc'),
                color: 'text-red-500 bg-red-50',
              },
              {
                icon: <FileText size={28} />,
                title: t('funcionalidades.f3_titulo'),
                desc: t('funcionalidades.f3_desc'),
                color: 'text-primary-600 bg-primary-50',
              },
              {
                icon: <Building2 size={28} />,
                title: t('funcionalidades.f4_titulo'),
                desc: t('funcionalidades.f4_desc'),
                color: 'text-purple-600 bg-purple-50',
              },
            ].map((feat, i) => (
              <div
                key={i}
                className="bg-gray-50 rounded-2xl p-6 hover:shadow-md transition-shadow border border-gray-100"
              >
                <div className={`w-12 h-12 rounded-xl ${feat.color} flex items-center justify-center mb-4`}>
                  {feat.icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{feat.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── BENEFÍCIOS ───────────── */}
      <section className="py-20 bg-gradient-to-br from-primary-800 to-primary-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">{t('beneficios.titulo')}</h2>
            <p className="text-primary-200">
              Clientes que adotaram a LinkMe BR reportam resultados em menos de 90 dias.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              t('beneficios.b1'),
              t('beneficios.b2'),
              t('beneficios.b3'),
              t('beneficios.b4'),
            ].map((benefit, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-white/10 border border-white/15 rounded-xl p-5 backdrop-blur-sm"
              >
                <CheckCircle2 size={22} className="text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-primary-100 leading-relaxed">{benefit}</p>
              </div>
            ))}
          </div>

          {/* Sensor types highlight */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              { icon: <Thermometer size={24} />, label: 'Temperatura', unit: '°C', range: '−10 a +60' },
              { icon: <Droplets size={24} />, label: 'Umidade', unit: '%UR', range: '0 a 100' },
              { icon: <Wind size={24} />, label: 'CO₂', unit: 'ppm', range: '0 a 10.000' },
            ].map((sensor) => (
              <div
                key={sensor.label}
                className="flex items-center gap-4 bg-white/10 border border-white/15 rounded-xl p-5"
              >
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  {sensor.icon}
                </div>
                <div>
                  <p className="font-semibold">{sensor.label}</p>
                  <p className="text-xs text-primary-200">
                    {sensor.range} {sensor.unit}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section id="faq" className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">{t('faq_section.titulo')}</h2>
          </div>

          {loadingFaq ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : faqs.length === 0 ? (
            /* Fallback FAQ items when API is unavailable */
            <div className="space-y-3">
              {[
                {
                  q: 'Como os sensores se comunicam com a plataforma?',
                  a: 'Os sensores utilizam protocolo LoRaWAN para transmitir dados a cada 3 minutos para os gateways de campo, que por sua vez enviam as leituras para nossa nuvem via conexão 4G/Ethernet.',
                },
                {
                  q: 'Qual a precisão dos sensores de temperatura?',
                  a: 'Nossos sensores possuem precisão de ±0,3°C para temperatura e ±2%UR para umidade relativa, calibrados conforme normas INMETRO.',
                },
                {
                  q: 'É necessário internet no local do silo?',
                  a: 'Apenas no gateway de campo. Os sensores nas barras comunicam via rádio LoRa com alcance de até 2 km, não necessitando de infraestrutura de rede local.',
                },
                {
                  q: 'Como são emitidos os alertas?',
                  a: 'Os alertas são exibidos no portal em tempo real e podem ser configurados para envio por e-mail e SMS quando parâmetros ultrapassam os limites definidos para cada silo.',
                },
              ].map((item, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    {item.q}
                    {faqOpen === i ? <ChevronUp size={18} className="flex-shrink-0 text-primary-600" /> : <ChevronDown size={18} className="flex-shrink-0 text-gray-400" />}
                  </button>
                  {faqOpen === i && (
                    <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-50">
                      <p className="pt-3">{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {faqs.map((faq) => (
                <div key={faq.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setFaqOpen(faqOpen === faq.id ? null : faq.id)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    {getFaqPergunta(faq)}
                    {faqOpen === faq.id ? (
                      <ChevronUp size={18} className="flex-shrink-0 text-primary-600" />
                    ) : (
                      <ChevronDown size={18} className="flex-shrink-0 text-gray-400" />
                    )}
                  </button>
                  {faqOpen === faq.id && (
                    <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-50">
                      <p className="pt-3">{getFaqResposta(faq)}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ───────────── CONTATO ───────────── */}
      <section id="contato" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left: text */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                {t('contato_section.titulo')}
              </h2>
              <p className="text-gray-600 mb-8 leading-relaxed">
                Preencha o formulário e nossa equipe entrará em contato em até 24 horas para
                agendar uma demonstração gratuita da plataforma.
              </p>

              <div className="space-y-4">
                {[
                  { icon: <CheckCircle2 size={18} className="text-primary-600" />, text: 'Demonstração gratuita e sem compromisso' },
                  { icon: <CheckCircle2 size={18} className="text-primary-600" />, text: 'Suporte técnico especializado em pós-colheita' },
                  { icon: <CheckCircle2 size={18} className="text-primary-600" />, text: 'Contrato flexível sem fidelidade' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-sm text-gray-700">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: form */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
              <form onSubmit={handleContatoSubmit} noValidate className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('contato_section.nome')} *
                    </label>
                    <input
                      type="text"
                      value={form.nome}
                      onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('contato_section.empresa')}
                    </label>
                    <input
                      type="text"
                      value={form.empresa}
                      onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('contato_section.email')} *
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('contato_section.telefone')}
                    </label>
                    <input
                      type="tel"
                      value={form.telefone}
                      onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('contato_section.mensagem')} *
                  </label>
                  <textarea
                    rows={4}
                    value={form.mensagem}
                    onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <Send size={16} />
                  )}
                  {t('contato_section.enviar')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
