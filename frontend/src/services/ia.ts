import api from './api';
import type { IaStatus, IaPrevisoes, IaRisco } from '../types/index';

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
