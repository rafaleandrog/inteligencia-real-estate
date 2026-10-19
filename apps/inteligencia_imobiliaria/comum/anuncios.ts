import { precoM2 } from './normalizar';

/** Vocabulários fechados dos cadastros de mercado (spec 5.4 a 5.6). */
export const TIPOS_IMOVEL = ['apartamento', 'casa', 'casa_condominio', 'kitnet', 'predio', 'terreno', 'nao_classificado'] as const;
export const ROTULO_TIPO_IMOVEL: Record<string, string> = {
  apartamento: 'Apartamento', casa: 'Casa', casa_condominio: 'Casa em condomínio', kitnet: 'Kitnet', predio: 'Prédio', terreno: 'Terreno', nao_classificado: 'Não classificado',
};
export const PRECISOES = ['exata_fonte', 'centroide_localidade_jitter_deterministico', 'centroide_localidade_jitter', 'centroide_ra_jitter_deterministico', 'manual', 'geocode_externo_quadra', 'geocode_externo_rua', 'geocode_externo_conjunto', 'geocode_externo_condominio'] as const;
export const ROTULO_PRECISAO: Record<string, string> = {
  exata_fonte: 'Exata (da fonte)', centroide_localidade_jitter_deterministico: 'Aproximada (centro da localidade)',
  centroide_localidade_jitter: 'Aproximada (centro da localidade)', centroide_ra_jitter_deterministico: 'Aproximada (centro da RA)', manual: 'Ajustada à mão',
  geocode_externo_quadra: 'Aproximada (geocodificação externa: quadra)', geocode_externo_rua: 'Aproximada (geocodificação externa: rua)',
  geocode_externo_conjunto: 'Aproximada (geocodificação externa: conjunto)', geocode_externo_condominio: 'Aproximada (geocodificação externa: condomínio)',
};
export const CATEGORIAS_ANCORA = ['escola', 'mobilidade', 'parque_equipamento_publico', 'saude', 'shopping_center', 'supermercado_atacarejo', 'universidade'] as const;
export const ROTULO_CATEGORIA_ANCORA: Record<string, string> = {
  escola: 'Escola', mobilidade: 'Mobilidade', parque_equipamento_publico: 'Parque ou equipamento público', saude: 'Saúde',
  shopping_center: 'Shopping center', supermercado_atacarejo: 'Supermercado ou atacarejo', universidade: 'Universidade',
};
export const ESTAGIOS_VENDA = ['em_construcao', 'em_lancamento', 'oferta', 'encerrado'] as const;

/** `vertical` para apartamento, prédio e kitnet; `horizontal` para casa, casa em condomínio e terreno. */
export function orientacao(tipoImovel: unknown): 'vertical' | 'horizontal' | null {
  if (['apartamento', 'predio', 'kitnet'].includes(String(tipoImovel))) return 'vertical';
  if (['casa', 'casa_condominio', 'terreno'].includes(String(tipoImovel))) return 'horizontal';
  return null;
}

/** Grupo da âncora derivado da categoria, quando vazio (spec 5.6). */
export function grupoDaCategoria(categoria: unknown): 'infraestrutura' | 'comercio_servico' {
  return ['shopping_center', 'supermercado_atacarejo'].includes(String(categoria)) ? 'comercio_servico' : 'infraestrutura';
}

/** Estágio de vendas derivado do texto livre de status quando vazio (spec 5.5). */
export function estagioDoStatus(status: unknown): string | null {
  const s = String(status ?? '').toLowerCase();
  if (!s) return null;
  if (s.includes('lançamento') || s.includes('lancamento')) return 'em_lancamento';
  if (s.includes('obra') || s.includes('constru')) return 'em_construcao';
  if (s.includes('pronto') || s.includes('oferta')) return 'oferta';
  if (s.includes('esgotado') || s.includes('encerrad') || s.includes('vendido')) return 'encerrado';
  return null;
}

/** Derivados em leitura do anúncio, nunca gravados (spec 5.4). */
export function derivadosAnuncio(a: Record<string, any>) {
  const c = precoM2(a.preco_pedido_brl, a.area_m2, a.preco_m2_informado_brl);
  return {
    orientacao: orientacao(a.tipo_imovel),
    preco_m2_calculado: c.calculado === null ? null : Math.round(c.calculado * 100) / 100,
    preco_m2: c.valor === null ? null : Math.round(c.valor * 100) / 100,
    divergencia_preco_m2_frac: c.divergencia_frac === null ? null : Math.round(c.divergencia_frac * 10000) / 10000,
    preco_m2_divergente: c.divergente,
    pode_calcular_distancia: a.precisao_coordenada === 'exata_fonte' || a.precisao_coordenada === 'manual',
  };
}

/** URL canônica de anúncio: sem query nem fragmento (spec 5.4). */
export function urlCanonica(u: string): string {
  try {
    const x = new URL(u);
    x.search = '';
    x.hash = '';
    return x.toString();
  } catch {
    return u;
  }
}
