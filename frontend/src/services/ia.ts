import api from './api';
import type { IaStatus, IaPrevisoes, IaRisco, IaSilosIaResponse, IaPrevisoeHistoricas } from '../types/index';

export type { IaPrevisoeHistoricas };

export async function getStatus(siloId: number | string): Promise<IaStatus> {
  const res = await api.get<IaStatus>('/ia/status', { params: { silo_id: siloId } });
  return res.data;
}

export async function solicitarTreino(siloId: number | string, modo: 'full' | 'incremental' | 'bootstrap') {
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

export async function getPrevisoeHistoricas(
  siloId: number | string,
  data_inicio: string,
  data_fim: string,
): Promise<IaPrevisoeHistoricas> {
  const res = await api.get<IaPrevisoeHistoricas>(`/ia/previsoes-historico/${siloId}`, {
    params: { data_inicio, data_fim },
  });
  return res.data;
}
