import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { listar, criar, buscar, atualizar, alterarStatus } from './usuarios.controller';

const router = Router();

/**
 * @openapi
 * /usuarios:
 *   get:
 *     tags: [Usuários]
 *     summary: Listar usuários
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  listar,
);

/**
 * @openapi
 * /usuarios:
 *   post:
 *     tags: [Usuários]
 *     summary: Criar usuário
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
 * /usuarios/{id}:
 *   get:
 *     tags: [Usuários]
 *     summary: Buscar usuário por ID
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/:id',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  buscar,
);

/**
 * @openapi
 * /usuarios/{id}:
 *   put:
 *     tags: [Usuários]
 *     summary: Atualizar usuário (não altera e-mail)
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
 * /usuarios/{id}/status:
 *   patch:
 *     tags: [Usuários]
 *     summary: Alterar status do usuário
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('administrador_geral', 'administrador_empresa'),
  alterarStatus,
);

export { router as usuariosRoutes };
