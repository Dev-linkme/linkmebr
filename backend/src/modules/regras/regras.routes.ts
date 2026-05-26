import { Router } from 'express';
import { listarRegras } from './regras.controller';

export const regrasRoutes = Router();

regrasRoutes.get('/', listarRegras);
