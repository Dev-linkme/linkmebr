import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import {
  listar,
  buscar,
  atualizar,
  alterarStatus,
  excluir,
  listarSensoresDeBarra,
  criarSensor,
} from './sensores.controller';

// Router principal montado em /sensores
const router = Router();

/**
 * @openapi
 * /sensores:
 *   get:
 *     tags: [Sensores]
 *     summary: Listar sensores (filtro opcional por barra_id)
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
 * /sensores/{id}:
 *   get:
 *     tags: [Sensores]
 *     summary: Buscar sensor por ID
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
 * /sensores/{id}:
 *   put:
 *     tags: [Sensores]
 *     summary: Atualizar sensor
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
 * /sensores/{id}/status:
 *   patch:
 *     tags: [Sensores]
 *     summary: Alterar status do sensor
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
 * /sensores/{id}:
 *   delete:
 *     tags: [Sensores]
 *     summary: Excluir sensor (bloqueia se tiver leituras)
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/:id',
  authenticate,
  authorize('administrador_empresa'),
  excluir,
);

// Router aninhado montado em /barras/:id/sensores (via barras.routes ou app.ts)
const barrasSensoresRouter = Router({ mergeParams: true });

/**
 * @openapi
 * /barras/{id}/sensores:
 *   get:
 *     tags: [Sensores]
 *     summary: Listar sensores de uma barra específica
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID da barra
 */
barrasSensoresRouter.get(
  '/',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  listarSensoresDeBarra,
);

/**
 * @openapi
 * /barras/{id}/sensores:
 *   post:
 *     tags: [Sensores]
 *     summary: Criar sensor em uma barra (unidade_medida preenchida automaticamente)
 *     security:
 *       - bearerAuth: []
 */
barrasSensoresRouter.post(
  '/',
  authenticate,
  authorize('administrador_empresa'),
  criarSensor,
);

export { router as sensoresRoutes, barrasSensoresRouter };
