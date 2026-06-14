import axios from 'axios';
import { redis } from './redis';
import { env } from './env';

const CACHE_KEY = 'ia:ingest_token';
const TTL_SECONDS = 3500;

export async function getIngestTokenCached(): Promise<string> {
  if (!env.INGEST_BASE_URL || !env.INGEST_IA_CLIENT_ID || !env.INGEST_IA_CLIENT_SECRET) {
    throw new Error('Serviço de IA não configurado (INGEST_BASE_URL, INGEST_IA_CLIENT_ID, INGEST_IA_CLIENT_SECRET)');
  }

  const cached = await redis.get(CACHE_KEY);
  if (cached) return cached;

  const { data } = await axios.post(
    `${env.INGEST_BASE_URL}/v1/ingest/auth/token`,
    { client_id: env.INGEST_IA_CLIENT_ID, client_secret: env.INGEST_IA_CLIENT_SECRET },
    { timeout: 10_000 },
  );

  const token: string = data.access_token;
  await redis.setex(CACHE_KEY, TTL_SECONDS, token);
  return token;
}
