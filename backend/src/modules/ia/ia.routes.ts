import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { listarJobs, solicitarTreino, buscarPrevisoes } from './ia.controller';

const router = Router();

const auth = [
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
];

const adminAuth = [
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
];

router.get('/jobs',               ...auth,      listarJobs);
router.post('/treino',            ...adminAuth, solicitarTreino);
router.get('/previsoes/:silo_id', ...auth,      buscarPrevisoes);

export { router as iaRoutes };
