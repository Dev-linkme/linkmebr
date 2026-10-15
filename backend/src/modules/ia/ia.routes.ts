import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import {
  buscarStatus, solicitarTreino, buscarPrevisoes, buscarRisco, listarSilosIa,
  previsoeHistoricas,
  listarHeartbeats, rangeHeartbeat, graficoHeartbeat, buscarHeartbeat,
} from './ia.controller';

const router = Router();

const auth = [
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
];

const adminAuth = [
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
];

router.get('/silos',                ...auth,      listarSilosIa);
router.get('/status',               ...auth,      buscarStatus);
router.get('/risco/:silo_id',       ...auth,      buscarRisco);
router.post('/treino',              ...adminAuth, solicitarTreino);
router.get('/previsoes-historico/:silo_id', ...auth, previsoeHistoricas);
router.get('/previsoes/:silo_id',          ...auth, buscarPrevisoes);
// Rotas específicas antes da parametrizada
router.get('/heartbeat/range',      ...auth,      rangeHeartbeat);
router.get('/heartbeat/grafico',    ...auth,      graficoHeartbeat);
router.get('/heartbeat',            ...auth,      listarHeartbeats);
router.get('/heartbeat/:silo_id',   ...auth,      buscarHeartbeat);

export { router as iaRoutes };
