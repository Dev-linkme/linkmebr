import { z } from 'zod';

export const criarBarraSchema = z.object({
  identificacao: z
    .string({ required_error: 'Identificação da barra é obrigatória' })
    .min(1, 'Identificação é obrigatória')
    .max(100, 'Identificação deve ter no máximo 100 caracteres'),
  status: z
    .enum(['ativa', 'inativa'], {
      errorMap: () => ({ message: 'Status deve ser "ativa" ou "inativa"' }),
    })
    .default('ativa'),
});

export const atualizarBarraSchema = criarBarraSchema.partial();

export const alterarStatusBarraSchema = z.object({
  status: z.enum(['ativa', 'inativa'], {
    errorMap: () => ({ message: 'Status deve ser "ativa" ou "inativa"' }),
  }),
});

export type CriarBarraInput = z.infer<typeof criarBarraSchema>;
export type AtualizarBarraInput = z.infer<typeof atualizarBarraSchema>;
