import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import {
  buscarLeituras,
  exportarCSV,
  buscarRange,
  buscarGrafico,
  buscarLeiturasExternas,
  exportarCSVExterno,
  buscarRangeExterno,
  buscarGraficoExterno,
  buscarLabradorStatus,
  buscarRangeLabrador,
  buscarGraficoLabrador,
} from './relatorios.controller';

const router = Router();

const auth = [
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
];

// ─── Leitura Interna ──────────────────────────────────────────────────────────
router.get('/leituras/grafico',  ...auth, buscarGrafico);
router.get('/leituras/range',    ...auth, buscarRange);
router.get('/leituras/export',   ...auth, exportarCSV);
router.get('/leituras',          ...auth, buscarLeituras);

// ─── Leitura Externa ─────────────────────────────────────────────────────────
router.get('/leituras-externas/grafico',  ...auth, buscarGraficoExterno);
router.get('/leituras-externas/range',    ...auth, buscarRangeExterno);
router.get('/leituras-externas/export',   ...auth, exportarCSVExterno);
router.get('/leituras-externas',          ...auth, buscarLeiturasExternas);

// ─── Labrador Status ──────────────────────────────────────────────────────────
router.get('/labrador-status/grafico', ...auth, buscarGraficoLabrador);
router.get('/labrador-status/range',   ...auth, buscarRangeLabrador);
router.get('/labrador-status',         ...auth, buscarLabradorStatus);

export { router as relatoriosRoutes };
