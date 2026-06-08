import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import {
  exportarLeituraInterna,
  exportarLeituraExterna,
  exportarAgrupada,
  periodoDisponivel,
} from './export.controller';

const router = Router();

router.get('/periodo', authenticate, periodoDisponivel);
router.get('/leitura_interna', authenticate, exportarLeituraInterna);
router.get('/leitura_externa', authenticate, exportarLeituraExterna);
router.get('/agrupada', authenticate, exportarAgrupada);

export { router as exportRoutes };
