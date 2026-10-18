import type { ObjetoTipo } from './objetos';

/** Entidades do imobiliário que um objeto da app pode referenciar (spec 5.25). */
export const ENTIDADES_NUCLEO = ['imoveis', 'incorporacoes', 'parcelamentos', 'matriculas'] as const;
export type EntidadeNucleo = (typeof ENTIDADES_NUCLEO)[number];
export const SUBTIPOS_IMOVEL = ['lote', 'gleba', 'unidade'] as const;
export type SubtipoImovel = (typeof SUBTIPOS_IMOVEL)[number];

/** Combinações permitidas objeto × entidade (spec 5.25; D-138). */
export const COMBINACOES: Partial<Record<ObjetoTipo, readonly EntidadeNucleo[]>> = {
  area_estudo: ['imoveis', 'parcelamentos', 'matriculas'],
  contorno: ['imoveis', 'parcelamentos'],
  terracap_lote: ['imoveis', 'parcelamentos'],
  lancamento: ['incorporacoes'],
  empreendimento: ['incorporacoes'],
};

export const OBJETOS_VINCULAVEIS = Object.keys(COMBINACOES) as ObjetoTipo[];

/** Tabela do imobiliário onde se confere o id (`buscarPorChave`) e caminho de leitura. */
export function tabelaNucleo(entidade: EntidadeNucleo, subtipo: SubtipoImovel | null): string | null {
  if (entidade === 'imoveis') return subtipo ? `${subtipo}s` : null;
  return entidade;
}

export function caminhoNucleo(entidade: EntidadeNucleo, subtipo: SubtipoImovel | null): string | null {
  if (entidade === 'imoveis') return subtipo ? `/${subtipo}s` : null;
  return `/${entidade}`;
}

export const ROTULO_ENTIDADE: Record<string, string> = {
  imoveis: 'Imóvel', lote: 'Lote', gleba: 'Gleba', unidade: 'Unidade', parcelamentos: 'Parcelamento', incorporacoes: 'Incorporação', matriculas: 'Matrícula',
};
