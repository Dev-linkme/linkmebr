import { z } from 'zod';

const tiposGrandeza = ['temperatura', 'umidade', 'co2'] as const;

export const criarSensorSchema = z.object({
  identificacao: z
    .string({ required_error: 'Identificação do sensor é obrigatória' })
    .min(1, 'Identificação é obrigatória')
    .max(100, 'Identificação deve ter no máximo 100 caracteres'),
  altura_solo_m: z
    .number({ required_error: 'Altura do solo é obrigatória', coerce: true })
    .min(0, 'Altura do solo não pode ser negativa')
    .max(9999.99, 'Altura do solo excede o máximo permitido'),
  tipo_grandeza: z.enum(tiposGrandeza, {
    errorMap: () => ({
      message: `Tipo de grandeza inválido. Valores aceitos: ${tiposGrandeza.join(', ')}`,
    }),
  }),
  status: z
    .enum(['ativo', 'inativo'], {
      errorMap: () => ({ message: 'Status deve ser "ativo" ou "inativo"' }),
    })
    .default('ativo'),
});

export const atualizarSensorSchema = criarSensorSchema.partial().omit({ tipo_grandeza: true }).extend({
  tipo_grandeza: z
    .enum(tiposGrandeza, {
      errorMap: () => ({
        message: `Tipo de grandeza inválido. Valores aceitos: ${tiposGrandeza.join(', ')}`,
      }),
    })
    .optional(),
});

export const alterarStatusSensorSchema = z.object({
  status: z.enum(['ativo', 'inativo'], {
    errorMap: () => ({ message: 'Status deve ser "ativo" ou "inativo"' }),
  }),
});

export type CriarSensorInput = z.infer<typeof criarSensorSchema>;
export type AtualizarSensorInput = z.infer<typeof atualizarSensorSchema>;

export const unidadesPorGrandeza: Record<string, string> = {
  temperatura: '°C',
  umidade: '%',
  co2: 'ppm',
};
