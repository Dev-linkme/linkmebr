import { Request, Response } from 'express';

const CATALOGO = [
  { codigo: 'E1', criterio: 'Intervalo irregular',       logica: 'Timestamp do registro > 3,5 min após a leitura anterior do mesmo sensor',              severidade: 'erro' },
  { codigo: 'E2', criterio: 'Limite físico',             logica: 'T fora [0–60 °C], UR fora [0–100 %] ou CO₂ fora [350–3000 ppm]',                       severidade: 'erro' },
  { codigo: 'E3', criterio: 'Extremos inválidos',        logica: 'max < avg ou min > avg',                                                                 severidade: 'erro' },
  { codigo: 'E4', criterio: 'Desvio extremo',            logica: 'max > avg + 4σ ou min < avg − 4σ',                                                       severidade: 'erro' },
  { codigo: 'E5', criterio: 'Sensor travado',            logica: '4 leituras consecutivas com avg idêntico para o mesmo sensor',                           severidade: 'erro' },
  { codigo: 'E6', criterio: 'Variação brusca',           logica: 'ΔT > 10 °C, ΔUR > 20 % ou ΔCO₂ > 800 ppm em relação à leitura anterior',               severidade: 'erro' },
  { codigo: 'A1', criterio: 'Desvio moderado',           logica: 'max > avg + 3σ ou min < avg − 3σ',                                                       severidade: 'advertência' },
  { codigo: 'A2', criterio: 'Variação elevada',          logica: 'ΔT > 5 °C, ΔUR > 10 % ou ΔCO₂ > 500 ppm em relação à leitura anterior',                severidade: 'advertência' },
  { codigo: 'A3', criterio: 'Gradiente vertical anômalo',logica: 'Temperatura não segue T_fundo < T_meio < T_topo na mesma barra',                         severidade: 'advertência' },
  { codigo: 'A4', criterio: 'Correlação T×UR suspeita',  logica: 'Temperatura subindo e UR caindo por 3 leituras consecutivas na mesma altura',            severidade: 'advertência' },
  { codigo: 'A5', criterio: 'CO₂ estável com T alta',    logica: 'CO₂ constante por 4 períodos com temperatura > 28 °C na mesma altura',                  severidade: 'advertência' },
  { codigo: 'A6', criterio: 'Inversão CO₂ topo/fundo',   logica: 'CO₂_topo > CO₂_fundo por 4 leituras consecutivas na mesma barra',                       severidade: 'advertência' },
  { codigo: 'AH', criterio: 'Variação horizontal',       logica: 'Diferença > 10 % entre cabos na mesma altura e timestamp próximos',                     severidade: 'advertência' },
];

export function listarRegras(_req: Request, res: Response): void {
  res.json(CATALOGO);
}
