import { z } from 'zod';

export const criarSolicitacaoContatoSchema = z.object({
  nome: z
    .string({ required_error: 'Nome é obrigatório' })
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(200, 'Nome deve ter no máximo 200 caracteres'),
  empresa: z.string().max(200, 'Nome da empresa deve ter no máximo 200 caracteres').optional(),
  email: z
    .string({ required_error: 'E-mail é obrigatório' })
    .email('E-mail inválido')
    .max(200, 'E-mail deve ter no máximo 200 caracteres'),
  telefone: z.string().max(20, 'Telefone deve ter no máximo 20 caracteres').optional(),
  mensagem: z
    .string({ required_error: 'Mensagem é obrigatória' })
    .min(10, 'Mensagem deve ter pelo menos 10 caracteres'),
});

export const atualizarStatusContatoSchema = z.object({
  status: z.enum(['novo', 'em_atendimento', 'concluido'], {
    errorMap: () => ({
      message: 'Status deve ser "novo", "em_atendimento" ou "concluido"',
    }),
  }),
  observacoes_internas: z.string().optional(),
});

export type CriarSolicitacaoContatoInput = z.infer<typeof criarSolicitacaoContatoSchema>;
export type AtualizarStatusContatoInput = z.infer<typeof atualizarStatusContatoSchema>;
