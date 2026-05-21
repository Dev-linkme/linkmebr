import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, Home, Building2, Database, Layers, Activity } from 'lucide-react';
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
  barras: 'Barras',
  sensores: 'Sensores',
};

const NIVEL_ICON: Record<Nivel, React.ReactNode> = {
  empresas: <Building2 size={22} />,
  silos: <Database size={22} />,
  barras: <Layers size={22} />,
  sensores: <Activity size={22} />,
};

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
      return (item.identificacao as string) || `Barra ${item.id}`;
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

function TableHeaders({ nivel }: { nivel: Nivel }) {
  const th = (label: string, key: string) => (
    <th key={key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
      {label}
    </th>
  );
  switch (nivel) {
    case 'empresas':
      return <>{th('Nome Fantasia', 'nf')}{th('Razão Social', 'rs')}{th('Status', 'st')}</>;
    case 'silos':
      return <>{th('Nome', 'nm')}{th('Localização', 'loc')}{th('Status', 'st')}</>;
    case 'barras':
      return <>{th('Identificação', 'id')}{th('Silo', 'silo')}{th('Status', 'st')}</>;
    case 'sensores':
      return <>{th('Identificação', 'id')}{th('Tipo', 'tp')}{th('Unidade', 'un')}{th('Status', 'st')}</>;
  }
}

function TableCells({ nivel, item }: { nivel: Nivel; item: AnyItem }) {
  const td = (content: React.ReactNode, key: string, extra = '') => (
    <td key={key} className={`px-4 py-3 text-sm text-gray-700 ${extra}`}>
      {content}
    </td>
  );
  switch (nivel) {
    case 'empresas':
      return (
        <>
          {td(<span className="font-medium text-gray-900">{(item.nome_fantasia as string) || '—'}</span>, 'nf')}
          {td(item.razao_social as string, 'rs')}
          {td(<StatusBadge status={item.status} />, 'st')}
        </>
      );
    case 'silos':
      return (
        <>
          {td(<span className="font-medium text-gray-900">{item.nome as string}</span>, 'nm')}
          {td([(item.cidade as string), (item.estado as string)].filter(Boolean).join(' / ') || '—', 'loc')}
          {td(<StatusBadge status={item.status} />, 'st')}
        </>
      );
    case 'barras': {
      const silo = item.silo as Record<string, unknown> | undefined;
      return (
        <>
          {td(<span className="font-medium text-gray-900">{item.identificacao as string}</span>, 'id')}
          {td((silo?.nome as string) || '—', 'silo')}
          {td(<StatusBadge status={item.status} />, 'st')}
        </>
      );
    }
    case 'sensores':
      return (
        <>
          {td(<span className="font-medium text-gray-900">{item.identificacao as string}</span>, 'id')}
          {td(item.tipo_grandeza as string, 'tp')}
          {td((item.unidade_medida as string) || '—', 'un')}
          {td(<StatusBadge status={item.status} />, 'st')}
        </>
      );
  }
}

export default function CadastrosPage() {
  const { nivel: nivelParam } = useParams<{ nivel: string }>();
  const startNivel = (nivelParam as Nivel | undefined) ?? 'silos';

  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [items, setItems] = useState<AnyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const currentNivel: Nivel =
    crumbs.length > 0 ? (NIVEL_NEXT[crumbs[crumbs.length - 1].nivel] as Nivel) : startNivel;

  const hasNext = NIVEL_NEXT[currentNivel] !== null;

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
    load(startNivel, []);
  }, [startNivel, load]);

  const handleSelect = (item: AnyItem) => {
    if (!hasNext) return;
    const nome = getNome(currentNivel, item);
    const newCrumbs: Crumb[] = [...crumbs, { nivel: currentNivel, id: item.id, nome }];
    setCrumbs(newCrumbs);
    load(NIVEL_NEXT[currentNivel]!, newCrumbs);
  };

  const goToRoot = () => {
    setCrumbs([]);
    load(startNivel, []);
  };

  const goToCrumb = (index: number) => {
    const newCrumbs = crumbs.slice(0, index + 1);
    setCrumbs(newCrumbs);
    load(NIVEL_NEXT[newCrumbs[newCrumbs.length - 1].nivel]!, newCrumbs);
  };

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

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Nenhum registro encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <TableHeaders nivel={currentNivel} />
                  {hasNext && <th className="px-4 py-3 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`transition-colors ${
                      hasNext
                        ? 'cursor-pointer hover:bg-green-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <TableCells nivel={currentNivel} item={item} />
                    {hasNext && (
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={16} className="text-gray-400 ml-auto" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
              {items.length} registro(s)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
