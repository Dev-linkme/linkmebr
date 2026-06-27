import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { listar, criar, buscar, atualizar, excluir } from './carregamentos.controller';

const router = Router();

const leitura = [authenticate, authorize('administrador_geral', 'administrador_empresa', 'operador_empresa')];
const escrita = [authenticate, authorize('administrador_geral', 'administrador_empresa')];

router.get('/', ...leitura, listar);
router.get('/:id', ...leitura, buscar);
router.post('/', ...escrita, criar);
router.put('/:id', ...escrita, atualizar);
router.delete('/:id', ...escrita, excluir);

export { router as carregamentosRoutes };
