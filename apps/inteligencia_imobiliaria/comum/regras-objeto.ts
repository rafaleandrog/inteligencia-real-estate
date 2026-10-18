/**
 * Regra por objeto (spec 14, T4; D-115): quem lê e quem escreve um registro,
 * além do nível da app e do papel. Código puro: o backend chama pela guarda
 * `exigirAcessoObjeto` e a tela usa para esconder o botão que daria 403.
 *
 * Área de estudo:
 * - `ler`: qualquer um, salvo `tipo = propria`, que só `estrategico`, `curador`,
 *   o responsável ou o admin leem (sigilo de 5.16).
 * - `escrever`: autor ou `curador` (área própria: só `curador`), sempre com o
 *   nível de escrita; o admin escreve tudo.
 * - `decidir`: mudar o estágio para `iniciativa` ou além, ou `encerrada`, é do
 *   admin ou do `decisor` (D-130), que precisa ler a área.
 */

export interface Ator {
  id: number;
  admin: boolean;
  escrita: boolean;
  papeis: readonly string[];
}

export type Operacao = 'ler' | 'escrever' | 'decidir';

export const ESTAGIOS = ['sinal', 'hipotese', 'oportunidade', 'iniciativa', 'projeto', 'negocio_ativo', 'encerrada'] as const;
export type Estagio = (typeof ESTAGIOS)[number];
/** Estágios cuja escolha é decisão (D-130): exigem admin ou `decisor` e motivo. */
export const ESTAGIOS_DECISAO: readonly Estagio[] = ['iniciativa', 'projeto', 'negocio_ativo', 'encerrada'];
export const TIPOS_AREA = ['propria', 'prospeccao', 'referencia'] as const;

const tem = (a: Ator, p: string) => a.admin || a.papeis.includes(p);

export function podeLerArea(a: Ator, area: { tipo?: string | null; responsavel_id?: number | null }): boolean {
  if (area.tipo !== 'propria') return true;
  return tem(a, 'estrategico') || tem(a, 'curador') || (area.responsavel_id !== null && area.responsavel_id !== undefined && Number(area.responsavel_id) === a.id);
}

export function podeEscreverArea(a: Ator, area: { tipo?: string | null; responsavel_id?: number | null; autor_id?: number | null }): boolean {
  if (!podeLerArea(a, area)) return false;
  if (a.admin) return true;
  if (!a.escrita) return false;
  if (area.tipo === 'propria') return a.papeis.includes('curador');
  return a.papeis.includes('curador') || (area.autor_id !== null && area.autor_id !== undefined && Number(area.autor_id) === a.id);
}

export function podeDecidirArea(a: Ator, area: { tipo?: string | null; responsavel_id?: number | null }): boolean {
  return podeLerArea(a, area) && (a.admin || (a.escrita && a.papeis.includes('decisor')));
}

export function podeArea(a: Ator, area: Record<string, any>, op: Operacao): boolean {
  return op === 'ler' ? podeLerArea(a, area) : op === 'escrever' ? podeEscreverArea(a, area) : podeDecidirArea(a, area);
}

/** Criar (ou passar para) área própria é do `curador` (5.16). */
export function podeTipoPropria(a: Ator): boolean {
  return a.admin || (a.escrita && a.papeis.includes('curador'));
}
