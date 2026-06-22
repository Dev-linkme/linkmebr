import api from './api';
import type { ComandoResponse, FirmwareCategoria, FirmwaresResponse } from '../types/index';

export async function dispararComando(
  siloId: number,
  comandoId: number,
  parametro: number | null = null,
  parametroExtra: string | null = null,
): Promise<ComandoResponse> {
  const res = await api.post<ComandoResponse>('/labrador/comandos', {
    silo_id: siloId,
    comando_id: comandoId,
    parametro,
    parametro_extra: parametroExtra,
  });
  return res.data;
}

export async function consultarComando(requestId: string): Promise<ComandoResponse> {
  const res = await api.get<ComandoResponse>(`/labrador/comandos/${requestId}`);
  return res.data;
}

export async function deletarComando(requestId: string): Promise<void> {
  await api.delete(`/labrador/comandos/${requestId}`);
}

export async function listarComandosDisponiveis(siloId: number | string): Promise<number[]> {
  const res = await api.get<unknown>(`/labrador/silos/${siloId}/comandos`);
  const data = res.data;
  if (Array.isArray(data)) return data as number[];
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).comandos_disponiveis)) {
    return (data as { comandos_disponiveis: number[] }).comandos_disponiveis;
  }
  return [];
}

// O serviço de comando remoto ainda está em implementação no linkme-server —
// o formato exato da resposta pode variar (array puro ou objeto com a lista
// embrulhada, como já ocorre em /v1/ia/jobs → {jobs: [...]}). Normaliza aqui
// para não propagar um shape inesperado ao componente.
function normalizarListaComandos(data: unknown): ComandoResponse[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const chave of ['comandos', 'data', 'items', 'results']) {
      if (Array.isArray(obj[chave])) return obj[chave] as ComandoResponse[];
    }
  }
  return [];
}

export async function listarComandos(siloId: number | string, limit = 20): Promise<ComandoResponse[]> {
  const res = await api.get<unknown>('/labrador/comandos', { params: { silo_id: siloId, limit } });
  return normalizarListaComandos(res.data);
}

export async function uploadFirmware(file: File, categoria: FirmwareCategoria, descricao?: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('categoria', categoria);
  if (descricao) form.append('descricao', descricao);
  const res = await api.post('/firmwares', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

function normalizarListaFirmwares(data: unknown): FirmwaresResponse {
  if (Array.isArray(data)) return { firmwares: data };
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const chave of ['firmwares', 'data', 'items', 'results']) {
      if (Array.isArray(obj[chave])) return { firmwares: obj[chave] as FirmwaresResponse['firmwares'] };
    }
  }
  return { firmwares: [] };
}

export async function listarFirmwares(categoria?: FirmwareCategoria): Promise<FirmwaresResponse> {
  const res = await api.get<unknown>('/firmwares', { params: categoria ? { categoria } : {} });
  return normalizarListaFirmwares(res.data);
}
