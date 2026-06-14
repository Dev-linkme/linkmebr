import jwt from 'jsonwebtoken';
import { redis } from './redis';
import { env } from './env';

const CACHE_KEY = 'ia:access_token';
const TTL_SECONDS = 3500;

export function getIaToken(): string {
  if (!env.IA_BASE_URL || !env.IA_JWT_SECRET) {
    throw new Error('Serviço de IA não configurado (IA_BASE_URL, IA_JWT_SECRET)');
  }

  return jwt.sign({ scope: 'admin' }, env.IA_JWT_SECRET, {
    algorithm: env.IA_JWT_ALGORITHM,
    expiresIn: 3600,
  });
}

export async function getIaTokenCached(): Promise<string> {
  if (!env.IA_BASE_URL || !env.IA_JWT_SECRET) {
    throw new Error('Serviço de IA não configurado (IA_BASE_URL, IA_JWT_SECRET)');
  }

  const cached = await redis.get(CACHE_KEY);
  if (cached) return cached;

  const token = jwt.sign({ scope: 'admin' }, env.IA_JWT_SECRET, {
    algorithm: env.IA_JWT_ALGORITHM,
    expiresIn: 3600,
  });

  await redis.setex(CACHE_KEY, TTL_SECONDS, token);
  return token;
}
