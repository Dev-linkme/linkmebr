import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { buscarLeituras, exportarCSV, buscarRange } from './relatorios.controller';

const router = Router();

/**
 * @openapi
 * /relatorios/leituras:
 *   get:
 *     tags: [Relatórios]
 *     summary: Buscar leituras com filtros opcionais e paginação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: silo_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: barra_id
 *         schema: { type: integer }
 *       - in: query
 *         name: sensor_id
 *         schema: { type: integer }
 *       - in: query
 *         name: data_inicio
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: data_fim
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: Lista paginada de leituras
 */
router.get(
  '/leituras/range',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  buscarRange,
);

router.get(
  '/leituras',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  buscarLeituras,
);

/**
 * @openapi
 * /relatorios/leituras/export:
 *   get:
 *     tags: [Relatórios]
 *     summary: Exportar leituras em CSV com todos os sensores do período
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: silo_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: data_inicio
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: data_fim
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Arquivo CSV
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get(
  '/leituras/export',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa', 'operador_empresa'),
  exportarCSV,
);

export { router as relatoriosRoutes };
