import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';
import { assertEmpresa } from '../../middlewares/tenantGuard';
import {
  criarSensorSchema,
  atualizarSensorSchema,
  alterarStatusSensorSchema,
  unidadesPorGrandeza,
} from './sensores.schema';

async function verificarAcessoBarra(barraId: number, userEmpresaId: number | null | undefined) {
  const barra = await prisma.barra.findUnique({
    where: { id: barraId },
    include: { silo: { select: { empresa_id: true } } },
  });
  if (!barra) throw new AppError(404, 'Barra não encontrada');
  assertEmpresa(userEmpresaId ?? null, barra.silo.empresa_id);
  return barra;
}

// Listagem de sensores de uma barra (usada em /barras/:id/sensores)
export async function listarSensoresDeBarra(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const barraId = Number(req.params.id);
    if (isNaN(barraId)) throw new AppError(400, 'ID da barra inválido');

    await verificarAcessoBarra(barraId, req.user?.empresa_id);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [total, sensores] = await Promise.all([
      prisma.sensor.count({ where: { barra_id: barraId } }),
      prisma.sensor.findMany({
        where: { barra_id: barraId },
        skip,
        take: limit,
        orderBy: { altura_solo_m: 'asc' },
        include: {
          barra: {
            select: {
              id: true,
              identificacao: true,
              silo: { select: { id: true, nome: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      data: sensores,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// Criação de sensor em uma barra (usada em /barras/:id/sensores)
export async function criarSensor(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const barraId = Number(req.params.id);
    if (isNaN(barraId)) throw new AppError(400, 'ID da barra inválido');

    await verificarAcessoBarra(barraId, req.user?.empresa_id);

    const data = criarSensorSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    // Preenche unidade_medida automaticamente pelo tipo_grandeza
    const unidade_medida = unidadesPorGrandeza[data.data.tipo_grandeza];

    const sensor = await prisma.sensor.create({
      data: {
        ...data.data,
        barra_id: barraId,
        unidade_medida,
      },
    });

    res.status(201).json(sensor);
  } catch (err) {
    next(err);
  }
}

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const barraId = req.query.barra_id ? Number(req.query.barra_id) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (barraId) where.barra_id = barraId;

    if (req.user?.perfil !== 'administrador_geral') {
      where.barra = { silo: { empresa_id: req.user?.empresa_id } };
    }

    const [total, sensores] = await Promise.all([
      prisma.sensor.count({ where }),
      prisma.sensor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { altura_solo_m: 'asc' },
        include: {
          barra: {
            select: {
              id: true,
              identificacao: true,
              silo: { select: { id: true, nome: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      data: sensores,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function buscar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const sensor = await prisma.sensor.findUnique({
      where: { id },
      include: {
        barra: {
          include: {
            silo: { select: { id: true, nome: true, empresa_id: true } },
          },
        },
      },
    });

    if (!sensor) throw new AppError(404, 'Sensor não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, sensor.barra.silo.empresa_id);

    res.json(sensor);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = atualizarSensorSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const sensor = await prisma.sensor.findUnique({
      where: { id },
      include: { barra: { include: { silo: { select: { empresa_id: true } } } } },
    });
    if (!sensor) throw new AppError(404, 'Sensor não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, sensor.barra.silo.empresa_id);

    const updateData: Record<string, unknown> = { ...data.data };

    // Atualiza unidade_medida se tipo_grandeza foi alterado
    if (data.data.tipo_grandeza) {
      updateData.unidade_medida = unidadesPorGrandeza[data.data.tipo_grandeza];
    }

    const atualizado = await prisma.sensor.update({ where: { id }, data: updateData });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}

export async function alterarStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const data = alterarStatusSensorSchema.safeParse(req.body);
    if (!data.success) {
      throw new AppError(400, data.error.errors.map((e) => e.message).join(', '));
    }

    const sensor = await prisma.sensor.findUnique({
      where: { id },
      include: { barra: { include: { silo: { select: { empresa_id: true } } } } },
    });
    if (!sensor) throw new AppError(404, 'Sensor não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, sensor.barra.silo.empresa_id);

    const atualizado = await prisma.sensor.update({
      where: { id },
      data: { status: data.data.status },
    });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}

export async function excluir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) throw new AppError(400, 'ID inválido');

    const sensor = await prisma.sensor.findUnique({
      where: { id },
      include: { barra: { include: { silo: { select: { empresa_id: true } } } } },
    });
    if (!sensor) throw new AppError(404, 'Sensor não encontrado');
    assertEmpresa(req.user?.empresa_id ?? null, sensor.barra.silo.empresa_id);

    // Deleta leituras (interna e externa) e sensor em transação
    // leitura_externa tem FK ON DELETE RESTRICT, portanto deve ser removida antes do sensor
    await prisma.$transaction([
      prisma.leituraInterna.deleteMany({ where: { sensor_id: id } }),
      prisma.leituraExterna.deleteMany({ where: { sensor_id: id } }),
      prisma.sensor.delete({ where: { id } }),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
