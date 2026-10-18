import type { Request } from 'express';
import { podeArea, podeLerArea, type Ator, type Operacao } from '../../comum/regras-objeto';
import { ErroApp, naoEncontrado } from './comum';

type Linha = Record<string, any>;

export function atorDe(req: Request): Ator {
  const nivel = req.contexto?.nivelApp;
  return {
    id: Number(req.contexto?.usuario?.id ?? 0),
    admin: nivel === 'admin',
    escrita: nivel === 'escrita' || nivel === 'admin',
    papeis: req.contexto?.rolesApp ?? [],
  };
}

/**
 * Guarda por objeto (spec 14, T4): quem não lê recebe `404` (não confirma que
 * existe); quem lê e não pode a operação recebe `403 OBJETO_SEM_PERMISSAO`.
 */
export function exigirAcessoArea(req: Request, area: Linha, op: Operacao): void {
  const ator = atorDe(req);
  if (!podeLerArea(ator, area)) throw naoEncontrado();
  if (op !== 'ler' && !podeArea(ator, area, op)) {
    throw new ErroApp(403, 'OBJETO_SEM_PERMISSAO', op === 'decidir'
      ? 'Mudar o estágio para iniciativa ou além, ou encerrar, é decisão do admin ou do decisor.'
      : 'Só o autor ou o curador editam esta área (área própria: só o curador).');
  }
}

/** Busca a área (inclusive removida) e aplica a guarda. */
export async function areaComAcesso(req: Request, id: number, op: Operacao): Promise<Linha> {
  const area = await req.dados!.buscar('areas_estudo', id, { incluir_removidos: true });
  if (!area) throw naoEncontrado();
  exigirAcessoArea(req, area, op);
  return area;
}

/** Ids das áreas próprias que o usuário NÃO lê (para tirar de listas e agregados antes de paginar). */
export async function areasOcultas(req: Request): Promise<Set<number>> {
  const ator = atorDe(req);
  const proprias = await req.dados!.varrerTudo('areas_estudo', { filtros: { tipo: 'propria' }, removidos: 'incluir' });
  return new Set(proprias.filter((a) => !podeLerArea(ator, a)).map((a) => Number(a.id)));
}
