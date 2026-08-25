// Porta, para o gerador do demo, as derivações que o Apps Script aplica na planilha.
//
// A semente de migração (migration/*.xlsx) é anterior ao backend v2.0.0 e não tem
// nenhuma das colunas novas. Sem estas funções, o modo demonstração exibiria
// `sales_stage`, `group` e `segment` sempre vazios — ou seja, os filtros e a legenda
// novos não seriam exercitados por ninguém antes de chegarem em produção.
//
// **Isto NÃO vai para src/normalize.js de propósito.** O navegador tem que *ler*
// `sales_stage`/`group`/`segment` da planilha, nunca rederivá-los: quem edita a célula
// à mão na planilha manda, e uma rederivação no cliente silenciosamente desfaria essa
// edição. Aqui é diferente — o demo não tem célula nenhuma para respeitar.
//
// A fidelidade destas cópias é cobrada por tests/derive-parity.test.js, que executa o
// Code.gs real no sandbox de vm e compara as duas implementações entrada por entrada,
// dirigido pela própria semente. Mesmo precedente do teste que afirma que
// `pricePerM2_` do backend concorda com `pricePerM2` do frontend.

/** Equivalente de `normalizeSlug_()` do Code.gs. */
export function normalizeSlug(value) {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Equivalente de `inferSalesStage_()` do Code.gs. */
export function inferSalesStage(status) {
  const slug = normalizeSlug(status);
  if (!slug) return '';
  if (/lancamento/.test(slug)) return 'em_lancamento';
  if (/(em_obra|em_obras|construcao|em_construcao|inicio_de_obras)/.test(slug)) return 'em_construcao';
  if (/(oferta|pronto|estoque|entregue)/.test(slug)) return 'oferta';
  return '';
}

/** Equivalente de `inferAnchorGroup_()` do Code.gs. */
export function inferAnchorGroup(category) {
  const slug = normalizeSlug(category);
  if (slug === 'mobilidade' || slug === 'parque_equipamento_publico') return 'infraestrutura';
  if (['escola', 'saude', 'shopping_center', 'supermercado_atacarejo', 'universidade'].includes(slug)) {
    return 'comercio_servico';
  }
  return '';
}

/** Equivalente de `inferAnchorSegment_()` do Code.gs. */
export function inferAnchorSegment(category, subcategory, name) {
  const categorySlug = normalizeSlug(category);
  const detail = normalizeSlug([subcategory, name].join(' '));
  if (categorySlug === 'escola') return 'escola';
  if (categorySlug === 'universidade') return 'universidade';
  if (categorySlug === 'supermercado_atacarejo') return /atac/.test(detail) ? 'atacado' : 'supermercado';
  if (categorySlug === 'saude') {
    if (/hospital/.test(detail)) return 'hospital';
    if (/laboratorio/.test(detail)) return 'laboratorio';
    if (/clinica/.test(detail)) return 'clinica';
  }
  if (categorySlug === 'mobilidade') {
    if (/metro/.test(detail)) return 'estacao_metro';
    if (/trem/.test(detail)) return 'estacao_trem';
    if (/rodovi/.test(detail)) return 'terminal_rodoviario';
    if (/aeroporto/.test(detail)) return 'aeroporto';
    if (/onibus/.test(detail)) return 'ponto_onibus';
  }
  return '';
}

/**
 * Aplica as derivações da aba a uma linha, **só onde a célula está vazia** — mesma
 * regra do `applyDerivations_()` do backend: valor informado sempre vence.
 */
export function deriveRow(sheet, row) {
  const out = { ...row };
  const empty = (field) => out[field] === undefined || String(out[field]).trim() === '';

  if (sheet === 'DEVELOPMENTS' && empty('sales_stage')) {
    out.sales_stage = inferSalesStage(out.status);
  }
  if (sheet === 'ANCHORS') {
    if (empty('group')) out.group = inferAnchorGroup(out.category);
    if (empty('segment')) out.segment = inferAnchorSegment(out.category, out.subcategory, out.name);
  }
  return out;
}
