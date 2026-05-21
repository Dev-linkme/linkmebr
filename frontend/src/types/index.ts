export interface Usuario {
  id: number;
  nome_completo: string;
  email: string;
  perfil: 'administrador_geral' | 'administrador_empresa' | 'operador_empresa';
  empresa_id: number | null;
  status: string;
}

export interface Empresa {
  id: number;
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  cidade?: string;
  estado?: string;
  status: string;
}

export interface Silo {
  id: number;
  empresa_id: number;
  nome: string;
  cidade?: string;
  estado?: string;
  latitude?: number;
  longitude?: number;
  descricao?: string;
  status: string;
  total_barras_ativas?: number;
  total_sensores_ativos?: number;
  alertas_ativos?: number;
  empresa?: Empresa;
}

export interface Barra {
  id: number;
  silo_id: number;
  identificacao: string;
  local: 'interno ao silo' | 'externo ao silo';
  status: string;
}

export interface Sensor {
  id: number;
  barra_id: number;
  identificacao: string;
  altura_solo_m: number;
  tipo_grandeza: 'temperatura' | 'umidade' | 'co2';
  unidade_medida: string;
  status: string;
  barra?: Pick<Barra, 'id' | 'identificacao'>;
}

export interface Leitura {
  id: string;
  sensor_id: number;
  timestamp: string;
  valor_avg: number;
  valor_max: number;
  valor_min: number;
  num_amostras: number;
  desvio_padrao?: number;
  sensor?: Sensor;
  barra?: Barra;
}

export interface Faq {
  id: number;
  pergunta_pt: string;
  pergunta_en: string;
  pergunta_es: string;
  resposta_pt: string;
  resposta_en: string;
  resposta_es: string;
  ordem: number;
  status: string;
}

export interface SolicitacaoContato {
  id: number;
  nome: string;
  empresa?: string;
  email: string;
  telefone?: string;
  mensagem: string;
  data_hora: string;
  status: string;
  observacoes_internas?: string;
}

export interface AuthUser {
  id: number;
  nome_completo: string;
  perfil: string;
  empresa_id: number | null;
}
