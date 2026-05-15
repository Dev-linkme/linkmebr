import { z } from 'zod';

const perfisValidos = ['administrador_geral', 'administrador_empresa', 'operador_empresa'] as const;

export const criarUsuarioSchema = z.object({
  nome_completo: z
    .string({ required_error: 'Nome completo é obrigatório' })
    .min(2, 'Nome completo deve ter pelo menos 2 caracteres')
    .max(200, 'Nome completo deve ter no máximo 200 caracteres'),
  email: z
    .string({ required_error: 'E-mail é obrigatório' })
    .email('E-mail inválido')
    .max(200, 'E-mail deve ter no máximo 200 caracteres'),
  senha: z
    .string({ required_error: 'Senha é obrigatória' })
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
      'Senha deve conter letra maiúscula, minúscula, número e caractere especial',
    ),
  perfil: z.enum(perfisValidos, {
    errorMap: () => ({
      message: `Perfil inválido. Valores aceitos: ${perfisValidos.join(', ')}`,
    }),
  }),
  empresa_id: z.number({ coerce: true }).int('ID da empresa deve ser inteiro').nullable().optional(),
  status: z
    .enum(['ativo', 'inativo'], {
      errorMap: () => ({ message: 'Status deve ser "ativo" ou "inativo"' }),
    })
    .default('ativo'),
});

export const atualizarUsuarioSchema = z.object({
  nome_completo: z
    .string()
    .min(2, 'Nome completo deve ter pelo menos 2 caracteres')
    .max(200, 'Nome completo deve ter no máximo 200 caracteres')
    .optional(),
  perfil: z
    .enum(perfisValidos, {
      errorMap: () => ({
        message: `Perfil inválido. Valores aceitos: ${perfisValidos.join(', ')}`,
      }),
    })
    .optional(),
  empresa_id: z.number({ coerce: true }).int().nullable().optional(),
  senha: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
      'Senha deve conter letra maiúscula, minúscula, número e caractere especial',
    )
    .optional(),
});

export const alterarStatusUsuarioSchema = z.object({
  status: z.enum(['ativo', 'inativo'], {
    errorMap: () => ({ message: 'Status deve ser "ativo" ou "inativo"' }),
  }),
});

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
