/**
 * Tipos de objeto da pesquisa (spec 5.24): vocabulário fechado, cada um ligado
 * à sua tabela. Nasce completo; a rota só aceita o tipo cuja tabela já existe
 * na fase em curso (`tabelaExiste`, conferido contra o `schema.json`).
 */
export const OBJETOS = {
  anuncio: { tabela: 'anuncios', rotulo: 'Anúncio', cadastro: 'anuncios' },
  lancamento: { tabela: 'lancamentos', rotulo: 'Lançamento', cadastro: 'lancamentos' },
  ancora: { tabela: 'ancoras', rotulo: 'Âncora', cadastro: 'ancoras' },
  contorno: { tabela: 'contornos', rotulo: 'Contorno', cadastro: 'contornos' },
  area_estudo: { tabela: 'areas_estudo', rotulo: 'Área de estudo', cadastro: 'areas' },
  terracap_lote: { tabela: 'terracap_lotes', rotulo: 'Lote Terracap', cadastro: 'terracap' },
  empreendimento: { tabela: 'empreendimentos', rotulo: 'Empreendimento', cadastro: 'empreendimentos' },
  licenca_obra: { tabela: 'licenciamento_obras', rotulo: 'Licença de obra', cadastro: 'licencas' },
  ponto_comercial: { tabela: 'pontos_comerciais', rotulo: 'Ponto comercial', cadastro: 'comercio' },
} as const;

export type ObjetoTipo = keyof typeof OBJETOS;
export const OBJETO_TIPOS = Object.keys(OBJETOS) as ObjetoTipo[];

export function ehObjetoTipo(v: unknown): v is ObjetoTipo {
  return typeof v === 'string' && v in OBJETOS;
}

/** Objeto de cada tabela importável (para as colunas `atr_<codigo>`). */
export function objetoDaTabela(tabela: string): ObjetoTipo | null {
  return (OBJETO_TIPOS.find((t) => OBJETOS[t].tabela === tabela) as ObjetoTipo | undefined) ?? null;
}

export const TIPOS_VALOR = ['numero', 'texto', 'data', 'booleano', 'opcao'] as const;
export type TipoValor = (typeof TIPOS_VALOR)[number];
export const UNIDADES = ['m2', 'brl', 'brl_m2', 'frac', 'un', 'm', 'km', 'ha', 'anos', 'dias'] as const;
/** Teto de atributos ativos, para o formulário e o filtro seguirem legíveis (5.24). */
export const TETO_ATRIBUTOS_ATIVOS = 200;
