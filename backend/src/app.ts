import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './utils/errors';

// Rotas
import { authRoutes } from './modules/auth/auth.routes';
import { empresasRoutes } from './modules/empresas/empresas.routes';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes';
import { silosRoutes } from './modules/silos/silos.routes';
import { barrasRoutes } from './modules/barras/barras.routes';
import { sensoresRoutes } from './modules/sensores/sensores.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { relatoriosRoutes } from './modules/relatorios/relatorios.routes';
import { saudeSistemaRoutes } from './modules/saude-sistema/saudeSistema.routes';
import { regrasRoutes } from './modules/regras/regras.routes';
import { faqPublicoRoutes, faqAdminRoutes } from './modules/faq/faq.routes';
import { contatoPublicoRoutes, contatoAdminRoutes } from './modules/contato/contato.routes';
import { exportRoutes } from './modules/export/export.routes';
import { esquematicosRoutes } from './modules/esquematicos/esquematicos.routes';
import { iaRoutes } from './modules/ia/ia.routes';

const app = express();

// Segurança e parsers
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger UI
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'LinkMe BR — API de Gestão de Silos de Grãos',
    version: '1.0.0',
    description: 'Backend do Portal de Gestão de Qualidade de Grãos em Silos',
  },
  servers: [{ url: '/api/v1', description: 'Servidor principal' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Autenticação e sessão' },
    { name: 'Empresas', description: 'Gestão de empresas clientes' },
    { name: 'Usuários', description: 'Gestão de usuários do sistema' },
    { name: 'Silos', description: 'Gestão de silos' },
    { name: 'Barras', description: 'Gestão de barras de sensores' },
    { name: 'Sensores', description: 'Gestão de sensores' },
    { name: 'Dashboard', description: 'Dados consolidados para o painel' },
    { name: 'Relatórios', description: 'Consulta e exportação de leituras' },
    { name: 'FAQ', description: 'Perguntas frequentes multilíngue' },
    { name: 'Contato', description: 'Solicitações de contato' },
  ],
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Prefixo de versão
const api = express.Router();

api.use('/auth', authRoutes);
api.use('/empresas', empresasRoutes);
api.use('/usuarios', usuariosRoutes);
api.use('/silos', silosRoutes);
api.use('/barras', barrasRoutes);
api.use('/sensores', sensoresRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/relatorios', relatoriosRoutes);
api.use('/saude-sistema', saudeSistemaRoutes);
api.use('/regras', regrasRoutes);
api.use('/faq', faqPublicoRoutes);
api.use('/contato', contatoPublicoRoutes);
api.use('/admin/faq', faqAdminRoutes);
api.use('/admin/contatos', contatoAdminRoutes);
api.use('/export', exportRoutes);
api.use('/silos/:id/esquematicos', esquematicosRoutes);
api.use('/ia', iaRoutes);

app.use('/api/v1', api);

// Retrocompatibilidade: rotas sem prefixo
app.use('/auth', authRoutes);
app.use('/empresas', empresasRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/silos', silosRoutes);
app.use('/barras', barrasRoutes);
app.use('/sensores', sensoresRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/relatorios', relatoriosRoutes);
app.use('/saude-sistema', saudeSistemaRoutes);
app.use('/regras', regrasRoutes);
app.use('/faq', faqPublicoRoutes);
app.use('/contato', contatoPublicoRoutes);
app.use('/admin/faq', faqAdminRoutes);
app.use('/admin/contatos', contatoAdminRoutes);

// Handler de erro — deve ser o último middleware
app.use(errorHandler);

export { app };
