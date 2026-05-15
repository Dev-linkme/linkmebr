import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { criarSolicitacao, listar, buscar, atualizarStatus } from './contato.controller';

// Rate limit: 3 por hora por IP para o endpoint público
const contatoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  message: {
    error:
      'Muitas solicitações de contato enviadas. Tente novamente em 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rota pública
const publicRouter = Router();

/**
 * @openapi
 * /contato:
 *   post:
 *     tags: [Contato]
 *     summary: Enviar solicitação de contato (público, rate limit 3/hora por IP)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, mensagem]
 *             properties:
 *               nome:
 *                 type: string
 *               empresa:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               telefone:
 *                 type: string
 *               mensagem:
 *                 type: string
 *     responses:
 *       201:
 *         description: Solicitação registrada com sucesso
 *       429:
 *         description: Muitas solicitações
 */
publicRouter.post('/', contatoRateLimit, criarSolicitacao);

// Rotas administrativas
const adminRouter = Router();
adminRouter.use(authenticate, authorize('administrador_geral'));

/**
 * @openapi
 * /admin/contatos:
 *   get:
 *     tags: [Contato]
 *     summary: Listar solicitações de contato
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get('/', listar);

/**
 * @openapi
 * /admin/contatos/{id}:
 *   get:
 *     tags: [Contato]
 *     summary: Buscar solicitação de contato por ID
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get('/:id', buscar);

/**
 * @openapi
 * /admin/contatos/{id}/status:
 *   patch:
 *     tags: [Contato]
 *     summary: Atualizar status da solicitação de contato
 *     security:
 *       - bearerAuth: []
 */
adminRouter.patch('/:id/status', atualizarStatus);

export { publicRouter as contatoPublicoRoutes, adminRouter as contatoAdminRoutes };
