import { z } from 'zod';

export const criarEmpresaSchema = z.object({
  razao_social: z
    .string({ required_error: 'Razão social é obrigatória' })
    .min(2, 'Razão social deve ter pelo menos 2 caracteres')
    .max(200, 'Razão social deve ter no máximo 200 caracteres'),
  nome_fantasia: z.string().max(200, 'Nome fantasia deve ter no máximo 200 caracteres').optional(),
  cnpj: z
    .string({ required_error: 'CNPJ é obrigatório' })
    .min(14, 'CNPJ inválido')
    .max(18, 'CNPJ inválido'),
  logradouro: z.string().max(300).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  estado: z
    .string()
    .length(2, 'Estado deve ter 2 caracteres (UF)')
    .toUpperCase()
    .optional(),
  cep: z.string().max(10).optional(),
  telefone: z.string().max(20).optional(),
  email: z.string().email('E-mail inválido').max(200).optional(),
  status: z.enum(['ativa', 'inativa'], {
    errorMap: () => ({ message: 'Status deve ser "ativa" ou "inativa"' }),
  }).default('ativa'),
});

export const atualizarEmpresaSchema = criarEmpresaSchema.partial().omit({ cnpj: true });

export const alterarStatusEmpresaSchema = z.object({
  status: z.enum(['ativa', 'inativa'], {
    errorMap: () => ({ message: 'Status deve ser "ativa" ou "inativa"' }),
  }),
});

export type CriarEmpresaInput = z.infer<typeof criarEmpresaSchema>;
export type AtualizarEmpresaInput = z.infer<typeof atualizarEmpresaSchema>;
