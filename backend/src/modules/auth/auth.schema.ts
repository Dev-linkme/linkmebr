import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string({ required_error: 'E-mail é obrigatório' }).email('E-mail inválido'),
  senha: z.string({ required_error: 'Senha é obrigatória' }).min(1, 'Senha é obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;
