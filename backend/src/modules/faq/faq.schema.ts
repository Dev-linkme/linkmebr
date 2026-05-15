import { z } from 'zod';

export const criarFaqSchema = z.object({
  pergunta_pt: z
    .string({ required_error: 'Pergunta em português é obrigatória' })
    .min(5, 'Pergunta (PT) deve ter pelo menos 5 caracteres'),
  pergunta_en: z
    .string({ required_error: 'Pergunta em inglês é obrigatória' })
    .min(5, 'Pergunta (EN) deve ter pelo menos 5 caracteres'),
  pergunta_es: z
    .string({ required_error: 'Pergunta em espanhol é obrigatória' })
    .min(5, 'Pergunta (ES) deve ter pelo menos 5 caracteres'),
  resposta_pt: z
    .string({ required_error: 'Resposta em português é obrigatória' })
    .min(10, 'Resposta (PT) deve ter pelo menos 10 caracteres'),
  resposta_en: z
    .string({ required_error: 'Resposta em inglês é obrigatória' })
    .min(10, 'Resposta (EN) deve ter pelo menos 10 caracteres'),
  resposta_es: z
    .string({ required_error: 'Resposta em espanhol é obrigatória' })
    .min(10, 'Resposta (ES) deve ter pelo menos 10 caracteres'),
  ordem: z.number({ coerce: true }).int('Ordem deve ser número inteiro').default(0),
  status: z
    .enum(['publicado', 'rascunho'], {
      errorMap: () => ({ message: 'Status deve ser "publicado" ou "rascunho"' }),
    })
    .default('rascunho'),
});

export const atualizarFaqSchema = criarFaqSchema.partial();

export const atualizarOrdemFaqSchema = z.object({
  ordem: z
    .number({ required_error: 'Ordem é obrigatória', coerce: true })
    .int('Ordem deve ser número inteiro'),
});

export type CriarFaqInput = z.infer<typeof criarFaqSchema>;
export type AtualizarFaqInput = z.infer<typeof atualizarFaqSchema>;

export const langSchema = z.enum(['pt', 'en', 'es']).default('pt');
