import api from './api';
import type { IaJobsResponse, IaPrevisoes } from '../types/index';

export async function getJobs(siloId: number | string, limit = 100): Promise<IaJobsResponse> {
  const res = await api.get<IaJobsResponse>('/ia/jobs', { params: { silo_id: siloId, limit } });
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
