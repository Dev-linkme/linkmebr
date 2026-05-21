import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { listarSilos, detalharSilo, climaSilo, painelSilo } from './dashboard.controller';

const router = Router();

/**
 * @openapi
 * /dashboard/silos:
 *   get:
 *     tags: [Dashboard]
 *     summary: Listar silos ativos com últimas leituras e alertas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de silos com resumo de sensores e alertas
 */
router.get(
  '/silos',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  listarSilos,
);

/**
 * @openapi
 * /dashboard/silos/{id}:
 *   get:
 *     tags: [Dashboard]
 *     summary: Detalhe do silo com leituras recentes agrupadas por barra/sensor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalhes do silo
 */
router.get(
  '/silos/:id/painel',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  painelSilo,
);

router.get(
  '/silos/:id',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  detalharSilo,
);

/**
 * @openapi
 * /dashboard/silos/{id}/clima:
 *   get:
 *     tags: [Dashboard]
 *     summary: Dados climáticos do silo via Open-Meteo (cache 30min no Redis)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Dados climáticos atuais
 */
router.get(
  '/silos/:id/clima',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  climaSilo,
);

export { router as dashboardRoutes };
