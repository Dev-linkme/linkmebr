import { z } from 'zod';

const localEnum = z.enum(['interno ao silo', 'externo ao silo'], {
  errorMap: () => ({ message: 'Local deve ser "interno ao silo" ou "externo ao silo"' }),
});

export const criarBarraSchema = z.object({
  identificacao: z
    .string({ required_error: 'Identificação da barra é obrigatória' })
    .min(1, 'Identificação é obrigatória')
    .max(100, 'Identificação deve ter no máximo 100 caracteres'),
  local: localEnum.default('interno ao silo'),
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
