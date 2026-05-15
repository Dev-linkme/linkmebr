import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Garante que o schema existe
  await prisma.$executeRaw`CREATE SCHEMA IF NOT EXISTS silos`;

  const senhaHash = await bcrypt.hash('Admin@123', 12);

  const adminExistente = await prisma.usuario.findUnique({
    where: { email: 'admin@linkmebr.com.br' },
  });

  if (!adminExistente) {
    const admin = await prisma.usuario.create({
      data: {
        nome_completo: 'Administrador',
        email: 'admin@linkmebr.com.br',
        senha_hash: senhaHash,
        perfil: 'administrador_geral',
        empresa_id: null,
        status: 'ativo',
      },
    });
    console.log(`Administrador geral criado com ID: ${admin.id}`);
  } else {
    console.log('Administrador geral já existe, pulando criação.');
  }

  // FAQ inicial de exemplo
  const faqCount = await prisma.faq.count();
  if (faqCount === 0) {
    await prisma.faq.createMany({
      data: [
        {
          pergunta_pt: 'O que é o portal de gestão de silos?',
          pergunta_en: 'What is the silo management portal?',
          pergunta_es: '¿Qué es el portal de gestión de silos?',
          resposta_pt:
            'É uma plataforma para monitoramento em tempo real da qualidade dos grãos armazenados em silos, com controle de temperatura, umidade e CO₂.',
          resposta_en:
            'It is a platform for real-time monitoring of the quality of grains stored in silos, with temperature, humidity and CO₂ control.',
          resposta_es:
            'Es una plataforma para el monitoreo en tiempo real de la calidad de los granos almacenados en silos, con control de temperatura, humedad y CO₂.',
          ordem: 1,
          status: 'publicado',
        },
        {
          pergunta_pt: 'Como funciona o sistema de alertas?',
          pergunta_en: 'How does the alert system work?',
          pergunta_es: '¿Cómo funciona el sistema de alertas?',
          resposta_pt:
            'Os sensores enviam leituras periodicamente. Quando um valor ultrapassa os limites configurados, um alerta é gerado automaticamente e exibido no dashboard.',
          resposta_en:
            'Sensors send readings periodically. When a value exceeds the configured limits, an alert is automatically generated and displayed on the dashboard.',
          resposta_es:
            'Los sensores envían lecturas periódicamente. Cuando un valor supera los límites configurados, se genera automáticamente una alerta y se muestra en el panel.',
          ordem: 2,
          status: 'publicado',
        },
      ],
    });
    console.log('FAQ inicial criado com 2 perguntas.');
  }

  console.log('Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
