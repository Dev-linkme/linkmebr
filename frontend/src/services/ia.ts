import api from './api';
import type { IaStatus, IaPrevisoes, IaRisco, IaSilosIaResponse, IaPrevisoeHistoricas, IaRiscoSerie, IaRiscoHistorico } from '../types/index';

export type { IaPrevisoeHistoricas, IaRiscoSerie, IaRiscoHistorico };

export async function getStatus(siloId: number | string): Promise<IaStatus> {
  const res = await api.get<IaStatus>('/ia/status', { params: { silo_id: siloId } });
  return res.data;
}

export async function solicitarTreino(siloId: number | string, modo: 'bootstrap' | 'full' | 'inferencia') {
  const res = await api.post('/ia/treino', { silo_id: Number(siloId), modo });
  return res.data;
}

export async function getPrevisoes(siloId: number | string): Promise<IaPrevisoes> {
  const res = await api.get<IaPrevisoes>(`/ia/previsoes/${siloId}`);
  return res.data;
}

export async function getRisco(siloId: number | string): Promise<IaRisco> {
  const res = await api.get<IaRisco>(`/ia/risco/${siloId}`);
  return res.data;
}

export async function getSilosIa(): Promise<IaSilosIaResponse> {
  const res = await api.get<IaSilosIaResponse>('/ia/silos');
  return res.data;
}

export async function getRiscoSerie(siloId: number | string): Promise<IaRiscoSerie> {
  const res = await api.get<IaRiscoSerie>(`/ia/risco-serie/${siloId}`);
  return res.data;
}

export async function getRiscoHistorico(siloId: number | string, horas = 24): Promise<IaRiscoHistorico> {
  const res = await api.get<IaRiscoHistorico>(`/ia/risco-historico/${siloId}`, { params: { horas } });
  return res.data;
}

export async function getPrevisoeHistoricas(
  siloId: number | string,
  data_inicio: string,
  data_fim: string,
  gerado_em_max?: string,
): Promise<IaPrevisoeHistoricas> {
  const params: Record<string, string> = { data_inicio, data_fim };
  if (gerado_em_max) params.gerado_em_max = gerado_em_max;
  const res = await api.get<IaPrevisoeHistoricas>(`/ia/previsoes-historico/${siloId}`, { params });
  return res.data;
}
