import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import {
  listar,
  criar,
  buscar,
  atualizar,
  alterarStatus,
  excluir,
} from './empresas.controller';

const router = Router();

// Todas as rotas de empresas são restritas ao administrador geral
router.use(authenticate, authorize('administrador_geral'));

/**
 * @openapi
 * /empresas:
 *   get:
 *     tags: [Empresas]
 *     summary: Listar empresas com paginação
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ativa, inativa] }
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de empresas
 */
router.get('/', listar);

/**
 * @openapi
 * /empresas:
 *   post:
 *     tags: [Empresas]
 *     summary: Criar nova empresa
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Empresa criada
 */
router.post('/', criar);

/**
 * @openapi
 * /empresas/{id}:
 *   get:
 *     tags: [Empresas]
 *     summary: Buscar empresa por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Dados da empresa
 */
router.get('/:id', buscar);

/**
 * @openapi
 * /empresas/{id}:
 *   put:
 *     tags: [Empresas]
 *     summary: Atualizar empresa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Empresa atualizada
 */
router.put('/:id', atualizar);

/**
 * @openapi
 * /empresas/{id}/status:
 *   patch:
 *     tags: [Empresas]
 *     summary: Alterar status da empresa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Status alterado
 */
router.patch('/:id/status', alterarStatus);

/**
 * @openapi
 * /empresas/{id}:
 *   delete:
 *     tags: [Empresas]
 *     summary: Excluir empresa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Empresa excluída
 */
router.delete('/:id', excluir);

export { router as empresasRoutes };
