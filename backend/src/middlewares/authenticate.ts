import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { AppError } from '../utils/errors';

export interface JwtPayload {
  id: number;
  perfil: 'administrador_geral' | 'administrador_empresa' | 'operador_empresa';
  empresa_id: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      token?: string;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'Token não fornecido');
    }

    const token = authHeader.slice(7);

    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      throw new AppError(401, 'Token inválido ou revogado');
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    req.token = token;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, 'Token inválido ou expirado'));
  }
}
