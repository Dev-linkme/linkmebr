import { AppError } from '../utils/errors';

/**
 * Garante que o usuário tem acesso ao recurso da empresa informada.
 * administrador_geral (empresa_id === null) sempre passa.
 */
export function assertEmpresa(
  userEmpresaId: number | null,
  recursoEmpresaId: number,
): void {
  if (userEmpresaId === null) return; // administrador_geral tem acesso irrestrito
  if (userEmpresaId !== recursoEmpresaId) {
    throw new AppError(403, 'Acesso negado: este recurso pertence a outra empresa');
  }
}
