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

export async function listarComandos(siloId: number | string, limit = 20): Promise<ComandoResponse[]> {
  const res = await api.get<ComandoResponse[]>('/labrador/comandos', { params: { silo_id: siloId, limit } });
  return res.data;
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

export async function listarFirmwares(categoria?: FirmwareCategoria): Promise<FirmwaresResponse> {
  const res = await api.get<FirmwaresResponse>('/firmwares', { params: categoria ? { categoria } : {} });
  return res.data;
}
