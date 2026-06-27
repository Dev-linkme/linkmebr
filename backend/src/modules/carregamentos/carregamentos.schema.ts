import { z } from 'zod';

export const criarCarregamentoSchema = z.object({
  silo_id: z.number({ required_error: 'silo_id é obrigatório' }).int().positive(),
  hora_referencia: z.coerce.date({
    required_error: 'hora_referencia é obrigatória',
    invalid_type_error: 'hora_referencia inválida',
  }),
  nivel_m: z.number({ required_error: 'nivel_m é obrigatório' }).nonnegative('nivel_m não pode ser negativo'),
  volume_sacos: z.number({ required_error: 'volume_sacos é obrigatório' }).nonnegative('volume_sacos não pode ser negativo'),
});

export const atualizarCarregamentoSchema = criarCarregamentoSchema.partial().omit({ silo_id: true });

export type CriarCarregamentoInput = z.infer<typeof criarCarregamentoSchema>;
export type AtualizarCarregamentoInput = z.infer<typeof atualizarCarregamentoSchema>;
