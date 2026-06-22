import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import {
  dispararComando,
  consultarComando,
  listarComandos,
  listarComandosDisponiveis,
  deletarComando,
  uploadFirmware,
  listarFirmwares,
} from './labrador.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Comando Remoto (Labrador) é uma funcionalidade restrita a administrador_geral —
// decisão deliberada de segurança, mais restritiva que o módulo de IA: comandos
// podem religar hardware (DTGs), acionar relé físico e instalar firmware via OTA.
const adminAuth = [authenticate, authorize('administrador_geral')];

const router = Router();

router.post('/comandos', ...adminAuth, dispararComando);
router.get('/comandos/:request_id', ...adminAuth, consultarComando);
router.delete('/comandos/:request_id', ...adminAuth, deletarComando);
router.get('/comandos', ...adminAuth, listarComandos);
router.get('/silos/:silo_id/comandos', ...adminAuth, listarComandosDisponiveis);

export { router as labradorRoutes };

const firmwaresRouter = Router();

firmwaresRouter.post('/', ...adminAuth, upload.single('file'), uploadFirmware);
firmwaresRouter.get('/', ...adminAuth, listarFirmwares);

export { firmwaresRouter as firmwaresRoutes };
