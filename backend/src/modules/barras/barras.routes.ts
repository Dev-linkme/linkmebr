import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { listar, buscar, atualizar, alterarStatus, excluir } from './barras.controller';
import { barrasSensoresRouter } from '../sensores/sensores.routes';

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /barras:
 *   get:
 *     tags: [Barras]
 *     summary: Listar barras (com filtro opcional por silo_id)
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
 * /barras/{id}:
 *   get:
 *     tags: [Barras]
 *     summary: Buscar barra por ID (inclui sensores)
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
 * /barras/{id}:
 *   put:
 *     tags: [Barras]
 *     summary: Atualizar barra
 *     security:
 *       - bearerAuth: []
 */
router.put(
  '/:id',
  authenticate,
  authorize('administrador_empresa'),
  atualizar,
);

/**
 * @openapi
 * /barras/{id}/status:
 *   patch:
 *     tags: [Barras]
 *     summary: Alterar status da barra
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('administrador_empresa'),
  alterarStatus,
);

/**
 * @openapi
 * /barras/{id}:
 *   delete:
 *     tags: [Barras]
 *     summary: Excluir barra (bloqueia se tiver sensores)
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador_empresa'),
  excluir,
);

/**
 * @openapi
 * /barras/{id}/sensores:
 *   get:
 *     tags: [Sensores]
 *     summary: Listar sensores de uma barra
 *     security:
 *       - bearerAuth: []
 *   post:
 *     tags: [Sensores]
 *     summary: Criar sensor em uma barra
 *     security:
 *       - bearerAuth: []
 */
router.use('/:id/sensores', barrasSensoresRouter);

export { router as barrasRoutes };
