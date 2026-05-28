import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { exportarLeituraInterna, exportarLeituraExterna } from './export.controller';

const router = Router();

router.get('/leitura_interna', authenticate, exportarLeituraInterna);
router.get('/leitura_externa', authenticate, exportarLeituraExterna);

export { router as exportRoutes };
