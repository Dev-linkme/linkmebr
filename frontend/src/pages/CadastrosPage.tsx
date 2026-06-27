import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Home, Building2, Database, Layers, Activity, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

type Nivel = 'empresas' | 'silos' | 'barras' | 'sensores';

const NIVEL_NEXT: Record<Nivel, Nivel | null> = {
  empresas: 'silos',
  silos: 'barras',
  barras: 'sensores',
  sensores: null,
};

const NIVEL_PARENT: Record<Nivel, Nivel | null> = {
  empresas: null,
  silos: 'empresas',
  barras: 'silos',
  sensores: 'barras',
};

const NIVEL_LABEL: Record<Nivel, string> = {
  empresas: 'Empresas',
  silos: 'Silos',
  barras: 'Cabos Pêndulo',
  sensores: 'Sensores',
};

const NIVEL_ICON: Record<Nivel, React.ReactNode> = {
  empresas: <Building2 size={22} />,
  silos: <Database size={22} />,
  barras: <Layers size={22} />,
  sensores: <Activity size={22} />,
};

const PAGE_SIZE = 10;

interface Crumb {
  nivel: Nivel;
  id: number;
  nome: string;
}

type AnyItem = Record<string, unknown> & { id: number; status: string };

function getNome(nivel: Nivel, item: AnyItem): string {
  switch (nivel) {
    case 'empresas':
      return (item.nome_fantasia as string) || (item.razao_social as string) || `Empresa ${item.id}`;
    case 'silos':
      return (item.nome as string) || `Silo ${item.id}`;
    case 'barras':
      return (item.identificacao as string) || `Cabo Pêndulo ${item.id}`;
    case 'sensores':
      return (item.identificacao as string) || `Sensor ${item.id}`;
  }
}

async function carregarItens(nivel: Nivel, crumbs: Crumb[]): Promise<AnyItem[]> {
  const parentNivel = NIVEL_PARENT[nivel];
  const parentCrumb = parentNivel ? crumbs.filter((c) => c.nivel === parentNivel).pop() : undefined;

  let url = '';
  switch (nivel) {
    case 'empresas':
      url = '/empresas?per_page=200';
      break;
    case 'silos':
      url = parentCrumb
        ? `/silos?empresa_id=${parentCrumb.id}&per_page=200`
        : '/silos?per_page=200';
      break;
    case 'barras':
      url = parentCrumb
        ? `/silos/${parentCrumb.id}/barras?per_page=200`
        : '/barras?per_page=200';
      break;
    case 'sensores':
      url = parentCrumb
        ? `/barras/${parentCrumb.id}/sensores?per_page=200`
        : '/sensores?per_page=200';
      break;
  }

  const res = await api.get(url);
  const raw = res.data;
  if (Array.isArray(raw)) return raw as AnyItem[];
  if (Array.isArray(raw?.data)) return raw.data as AnyItem[];
  return [];
}

const STATUS_STYLE: Record<string, string> = {
  ativo: 'bg-green-100 text-green-700',
  ativa: 'bg-green-100 text-green-700',
  inativo: 'bg-gray-100 text-gray-500',
  inativa: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

// ─── Definição de colunas (fonte única para cabeçalho, célula, busca e ordenação) ──

interface ColumnDef {
  key: string;
  label: string;
  getValue: (item: AnyItem) => string | number;
  render?: (item: AnyItem) => React.ReactNode;
}

function getColumns(nivel: Nivel): ColumnDef[] {
  switch (nivel) {
    case 'empresas':
      return [
        {
          key: 'nf', label: 'Nome Fantasia',
          getValue: (i) => (i.nome_fantasia as string) || '',
          render: (i) => <span className="font-medium text-gray-900">{(i.nome_fantasia as string) || '—'}</span>,
        },
        { key: 'rs', label: 'Razão Social', getValue: (i) => (i.razao_social as string) || '' },
        { key: 'st', label: 'Status', getValue: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
      ];
    case 'silos':
      return [
        {
          key: 'nm', label: 'Nome',
          getValue: (i) => (i.nome as string) || '',
          render: (i) => <span className="font-medium text-gray-900">{i.nome as string}</span>,
        },
        {
          key: 'loc', label: 'Localização',
          getValue: (i) => [(i.cidade as string), (i.estado as string)].filter(Boolean).join(' / ') || '',
        },
        { key: 'lab', label: 'ID Labrador', getValue: (i) => (i.id_labrador != null ? Number(i.id_labrador) : '') },
        { key: 'st', label: 'Status', getValue: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
      ];
    case 'barras':
      return [
        {
          key: 'id', label: 'Identificação',
          getValue: (i) => (i.identificacao as string) || '',
          render: (i) => <span className="font-medium text-gray-900">{i.identificacao as string}</span>,
        },
        { key: 'silo', label: 'Silo', getValue: (i) => ((i.silo as Record<string, unknown>)?.nome as string) || '' },
        {
          key: 'loc', label: 'Local',
          getValue: (i) => (i.local as string) || '',
          render: (i) => (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 capitalize">
              {(i.local as string) || '—'}
            </span>
          ),
        },
        { key: 'lab', label: 'ID Labrador', getValue: (i) => (i.id_labrador != null ? Number(i.id_labrador) : '') },
        { key: 'st', label: 'Status', getValue: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
      ];
    case 'sensores':
      return [
        {
          key: 'id', label: 'Identificação',
          getValue: (i) => (i.identificacao as string) || '',
          render: (i) => <span className="font-medium text-gray-900">{i.identificacao as string}</span>,
        },
        {
          key: 'silo', label: 'Silo',
          getValue: (i) => (((i.barra as Record<string, unknown>)?.silo as Record<string, unknown>)?.nome as string) || '',
        },
        { key: 'br', label: 'Cabo Pêndulo', getValue: (i) => ((i.barra as Record<string, unknown>)?.identificacao as string) || '' },
        { key: 'tp', label: 'Tipo', getValue: (i) => (i.tipo_grandeza as string) || '' },
        { key: 'un', label: 'Unidade', getValue: (i) => (i.unidade_medida as string) || '' },
        {
          key: 'alt', label: 'Altura (m)',
          getValue: (i) => (i.altura_solo_m != null ? Number(i.altura_solo_m) : ''),
          render: (i) => (i.altura_solo_m != null ? `${i.altura_solo_m} m` : '—'),
        },
        { key: 'lab', label: 'ID Labrador', getValue: (i) => (i.id_labrador != null ? Number(i.id_labrador) : '') },
        { key: 'st', label: 'Status', getValue: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
      ];
  }
}

function matchesSearch(columns: ColumnDef[], item: AnyItem, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return columns.some((c) => String(c.getValue(item) ?? '').toLowerCase().includes(q));
}

function sortItems(columns: ColumnDef[], items: AnyItem[], sortKey: string | null, sortDir: 'asc' | 'desc'): AnyItem[] {
  if (!sortKey) return items;
  const col = columns.find((c) => c.key === sortKey);
  if (!col) return items;
  const sorted = [...items].sort((a, b) => {
    const va = col.getValue(a);
    const vb = col.getValue(b);
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb), 'pt-BR');
  });
  return sortDir === 'asc' ? sorted : sorted.reverse();
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function CadastrosPage() {
  const { nivel: nivelParam } = useParams<{ nivel: string }>();
  const startNivel = (nivelParam as Nivel | undefined) ?? 'silos';

  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [items, setItems] = useState<AnyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const currentNivel: Nivel =
    crumbs.length > 0 ? (NIVEL_NEXT[crumbs[crumbs.length - 1].nivel] as Nivel) : startNivel;

  const hasNext = NIVEL_NEXT[currentNivel] !== null;
  const columns = getColumns(currentNivel);

  const resetTableState = () => { setBusca(''); setPagina(1); setSortKey(null); setSortDir('asc'); };

  const load = useCallback(async (nivel: Nivel, breadcrumbs: Crumb[]) => {
    setLoading(true);
    try {
      const data = await carregarItens(nivel, breadcrumbs);
      setItems(data);
    } catch {
      toast.error(`Erro ao carregar ${NIVEL_LABEL[nivel].toLowerCase()}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCrumbs([]);
    resetTableState();
    load(startNivel, []);
  }, [startNivel, load]);

  const handleSelect = (item: AnyItem) => {
    if (!hasNext) return;
    const nome = getNome(currentNivel, item);
    const newCrumbs: Crumb[] = [...crumbs, { nivel: currentNivel, id: item.id, nome }];
    setCrumbs(newCrumbs);
    resetTableState();
    load(NIVEL_NEXT[currentNivel]!, newCrumbs);
  };

  const goToRoot = () => {
    setCrumbs([]);
    resetTableState();
    load(startNivel, []);
  };

  const goToCrumb = (index: number) => {
    const newCrumbs = crumbs.slice(0, index + 1);
    setCrumbs(newCrumbs);
    resetTableState();
    load(NIVEL_NEXT[newCrumbs[newCrumbs.length - 1].nivel]!, newCrumbs);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPagina(1);
  };

  const filtrados = items.filter((item) => matchesSearch(columns, item, busca));
  const ordenados = sortItems(columns, filtrados, sortKey, sortDir);
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const itensPagina = ordenados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 text-green-700">
        {NIVEL_ICON[startNivel]}
        <h1 className="text-2xl font-bold text-gray-900">{NIVEL_LABEL[startNivel]}</h1>
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 flex-wrap text-sm min-h-[24px]">
        <button
          onClick={goToRoot}
          className="flex items-center gap-1 text-gray-500 hover:text-green-700 font-medium transition-colors"
        >
          <Home size={13} />
          {NIVEL_LABEL[startNivel]}
        </button>
        {crumbs.map((crumb, i) => (
          <span key={`${crumb.nivel}-${crumb.id}`} className="flex items-center gap-1">
            <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />
            <button
              onClick={() => goToCrumb(i)}
              className="text-gray-500 hover:text-green-700 font-medium transition-colors truncate max-w-[160px]"
              title={crumb.nome}
            >
              {crumb.nome}
            </button>
          </span>
        ))}
        {crumbs.length > 0 && (
          <span className="flex items-center gap-1">
            <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-900">{NIVEL_LABEL[currentNivel]}</span>
          </span>
        )}
      </nav>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
          placeholder={`Buscar em ${NIVEL_LABEL[currentNivel].toLowerCase()}...`}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : ordenados.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            {busca ? 'Nenhum registro encontrado para a busca.' : 'Nenhum registro encontrado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => handleSort(c.key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-800"
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sortKey === c.key ? (
                          sortDir === 'asc' ? <ChevronUp size={13} className="text-green-600" /> : <ChevronDown size={13} className="text-green-600" />
                        ) : (
                          <ChevronDown size={13} className="text-gray-300" />
                        )}
                      </span>
                    </th>
                  ))}
                  {hasNext && <th className="px-4 py-3 w-12" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itensPagina.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`transition-colors ${
                      hasNext
                        ? 'cursor-pointer hover:bg-green-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-sm text-gray-700">
                        {c.render ? c.render(item) : (c.getValue(item) || '—')}
                      </td>
                    ))}
                    {hasNext && (
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={20} className="text-green-500 ml-auto" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {ordenados.length} registro(s){busca ? ` (filtrado de ${items.length})` : ''}
              </p>
              {totalPaginas > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Página {paginaAtual} / {totalPaginas}</span>
                  <button
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={paginaAtual <= 1}
                    className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={13} />Anterior
                  </button>
                  <button
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaAtual >= totalPaginas}
                    className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Próximo<ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
