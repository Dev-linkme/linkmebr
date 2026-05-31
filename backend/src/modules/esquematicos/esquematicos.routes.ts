import { Router } from 'express';
import multer from 'multer';
import * as os from 'os';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { getSvg, getEntidades, getMapeamento, salvarMapeamento, getTooltip, uploadDxf } from './esquematicos.controller';

const upload = multer({ dest: os.tmpdir() });
const router = Router({ mergeParams: true });

router.get('/:vista/svg',       authenticate, getSvg);
router.get('/:vista/entidades', authenticate, getEntidades);
router.get('/mapeamento',       authenticate, getMapeamento);
router.put('/mapeamento',       authenticate, authorize('administrador_empresa', 'administrador_geral'), salvarMapeamento);
router.get('/tooltip',          authenticate, getTooltip);
router.post('/:vista/upload',   authenticate, authorize('administrador_empresa', 'administrador_geral'), upload.single('dxf'), uploadDxf);

export { router as esquematicosRoutes };
