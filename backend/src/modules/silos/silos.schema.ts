import { z } from 'zod';

export const criarSiloSchema = z.object({
  empresa_id: z
    .number({ required_error: 'empresa_id é obrigatório', coerce: true })
    .int('ID da empresa deve ser inteiro')
    .positive('ID da empresa deve ser positivo'),
  nome: z
    .string({ required_error: 'Nome do silo é obrigatório' })
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(200, 'Nome deve ter no máximo 200 caracteres'),
  logradouro: z.string().max(300).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  estado: z.string().length(2, 'Estado deve ter 2 caracteres (UF)').toUpperCase().optional(),
  latitude: z
    .number({ coerce: true })
    .min(-90, 'Latitude inválida')
    .max(90, 'Latitude inválida')
    .optional(),
  longitude: z
    .number({ coerce: true })
    .min(-180, 'Longitude inválida')
    .max(180, 'Longitude inválida')
    .optional(),
  descricao: z.string().optional(),
  status: z
    .enum(['ativo', 'inativo'], {
      errorMap: () => ({ message: 'Status deve ser "ativo" ou "inativo"' }),
    })
    .default('ativo'),
  id_labrador: z.number({ coerce: true }).int().positive().optional(),
});

export const atualizarSiloSchema = criarSiloSchema.partial().omit({ empresa_id: true });

export const alterarStatusSiloSchema = z.object({
  status: z.enum(['ativo', 'inativo'], {
    errorMap: () => ({ message: 'Status deve ser "ativo" ou "inativo"' }),
  }),
});

export type CriarSiloInput = z.infer<typeof criarSiloSchema>;
export type AtualizarSiloInput = z.infer<typeof atualizarSiloSchema>;
