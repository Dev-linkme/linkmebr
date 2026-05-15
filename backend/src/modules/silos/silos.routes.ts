import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { listar, criar, buscar, atualizar, alterarStatus, excluir } from './silos.controller';
import { listarBarrasDeSilo, criarBarra } from '../barras/barras.controller';

const router = Router();

/**
 * @openapi
 * /silos:
 *   get:
 *     tags: [Silos]
 *     summary: Listar silos
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  listar,
);

/**
 * @openapi
 * /silos:
 *   post:
 *     tags: [Silos]
 *     summary: Criar silo
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  criar,
);

/**
 * @openapi
 * /silos/{id}:
 *   get:
 *     tags: [Silos]
 *     summary: Buscar silo por ID
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/:id',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  buscar,
);

/**
 * @openapi
 * /silos/{id}:
 *   put:
 *     tags: [Silos]
 *     summary: Atualizar silo
 *     security:
 *       - bearerAuth: []
 */
router.put(
  '/:id',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  atualizar,
);

/**
 * @openapi
 * /silos/{id}/status:
 *   patch:
 *     tags: [Silos]
 *     summary: Alterar status do silo
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  alterarStatus,
);

/**
 * @openapi
 * /silos/{id}:
 *   delete:
 *     tags: [Silos]
 *     summary: Excluir silo (bloqueia se tiver barras)
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  excluir,
);

// Rotas aninhadas de barras
/**
 * @openapi
 * /silos/{id}/barras:
 *   get:
 *     tags: [Barras]
 *     summary: Listar barras de um silo
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/:id/barras',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  listarBarrasDeSilo,
);

/**
 * @openapi
 * /silos/{id}/barras:
 *   post:
 *     tags: [Barras]
 *     summary: Criar barra em um silo
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/:id/barras',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  criarBarra,
);

export { router as silosRoutes };
