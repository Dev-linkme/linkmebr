import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import {
  listarPublico,
  listarAdmin,
  criar,
  buscar,
  atualizar,
  atualizarOrdem,
  excluir,
} from './faq.controller';

// Rota pública
const publicRouter = Router();

/**
 * @openapi
 * /faq:
 *   get:
 *     tags: [FAQ]
 *     summary: Listar perguntas frequentes publicadas (público, sem autenticação)
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema: { type: string, enum: [pt, en, es], default: pt }
 *     responses:
 *       200:
 *         description: Lista de FAQs publicadas no idioma solicitado
 */
publicRouter.get('/', listarPublico);

// Rotas administrativas
const adminRouter = Router();
adminRouter.use(authenticate, authorize('administrador_geral'));

/**
 * @openapi
 * /admin/faq:
 *   get:
 *     tags: [FAQ]
 *     summary: Listar todas as FAQs (admin)
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get('/', listarAdmin);

/**
 * @openapi
 * /admin/faq:
 *   post:
 *     tags: [FAQ]
 *     summary: Criar FAQ
 *     security:
 *       - bearerAuth: []
 */
adminRouter.post('/', criar);

/**
 * @openapi
 * /admin/faq/{id}:
 *   get:
 *     tags: [FAQ]
 *     summary: Buscar FAQ por ID
 *     security:
 *       - bearerAuth: []
 */
adminRouter.get('/:id', buscar);

/**
 * @openapi
 * /admin/faq/{id}:
 *   put:
 *     tags: [FAQ]
 *     summary: Atualizar FAQ
 *     security:
 *       - bearerAuth: []
 */
adminRouter.put('/:id', atualizar);

/**
 * @openapi
 * /admin/faq/{id}/ordem:
 *   patch:
 *     tags: [FAQ]
 *     summary: Atualizar ordem da FAQ
 *     security:
 *       - bearerAuth: []
 */
adminRouter.patch('/:id/ordem', atualizarOrdem);

/**
 * @openapi
 * /admin/faq/{id}:
 *   delete:
 *     tags: [FAQ]
 *     summary: Excluir FAQ
 *     security:
 *       - bearerAuth: []
 */
adminRouter.delete('/:id', excluir);

export { publicRouter as faqPublicoRoutes, adminRouter as faqAdminRoutes };
