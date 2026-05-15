import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { redis } from './config/redis';

async function bootstrap() {
  try {
    // Testa conexão com o banco
    await prisma.$connect();
    console.log('Banco de dados conectado');

    // Inicia o servidor
    const server = app.listen(env.PORT, () => {
      console.log(`[${env.NODE_ENV}] Servidor rodando na porta ${env.PORT}`);
      console.log(`Swagger UI disponível em: http://localhost:${env.PORT}/api-docs`);
      console.log(`Health check: http://localhost:${env.PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\nRecebido ${signal}, encerrando servidor...`);
      server.close(async () => {
        await prisma.$disconnect();
        redis.disconnect();
        console.log('Servidor encerrado com sucesso');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Falha ao iniciar servidor:', error);
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(1);
  }
}

bootstrap();
