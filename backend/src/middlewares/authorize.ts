import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { JwtPayload } from './authenticate';

export function authorize(...perfis: JwtPayload['perfil'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Não autenticado'));
      return;
    }
    if (!perfis.includes(req.user.perfil)) {
      next(new AppError(403, 'Acesso negado: perfil sem permissão para esta operação'));
      return;
    }
    next();
  };
}
