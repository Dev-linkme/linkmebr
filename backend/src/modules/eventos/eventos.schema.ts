import { z } from 'zod';

export const criarEventoSchema = z.object({
  silo_id: z.number({ required_error: 'silo_id é obrigatório' }).int().positive(),
  hora_referencia: z.coerce.date({
    required_error: 'hora_referencia é obrigatória',
    invalid_type_error: 'hora_referencia inválida',
  }),
  descricao_resumida: z
    .string({ required_error: 'descricao_resumida é obrigatória' })
    .min(2, 'Descrição resumida deve ter pelo menos 2 caracteres')
    .max(200, 'Descrição resumida deve ter no máximo 200 caracteres'),
  descricao_completa: z.string().max(5000, 'Descrição completa deve ter no máximo 5000 caracteres').optional(),
});

export const atualizarEventoSchema = criarEventoSchema.partial().omit({ silo_id: true });

export type CriarEventoInput = z.infer<typeof criarEventoSchema>;
export type AtualizarEventoInput = z.infer<typeof atualizarEventoSchema>;
