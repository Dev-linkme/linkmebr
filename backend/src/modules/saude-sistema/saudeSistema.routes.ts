import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import {
  buscarLabradorStatus,
  buscarRangeLabrador,
  buscarGraficoLabrador,
  buscarComunicacao,
  buscarRangeComunicacao,
  buscarGraficoComunicacao,
} from './saudeSistema.controller';

const router = Router();

const auth = [
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
];

// ─── Labrador Status ──────────────────────────────────────────────────────────
router.get('/labrador-status/grafico', ...auth, buscarGraficoLabrador);
router.get('/labrador-status/range',   ...auth, buscarRangeLabrador);
router.get('/labrador-status',         ...auth, buscarLabradorStatus);

// ─── Comunicação Status ───────────────────────────────────────────────────────
router.get('/comunicacao/grafico', ...auth, buscarGraficoComunicacao);
router.get('/comunicacao/range',   ...auth, buscarRangeComunicacao);
router.get('/comunicacao',         ...auth, buscarComunicacao);

export { router as saudeSistemaRoutes };
