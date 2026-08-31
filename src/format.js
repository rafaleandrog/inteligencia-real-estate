// Formatação para exibição e utilidades de saneamento.
//
// Funções puras. As de segurança (escapeHtml, safeExternalUrl) existem porque todo
// texto aqui vem de uma planilha pública que qualquer editor pode alterar — tratamos
// o dado como não confiável por princípio (R4.4, R4.6).

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Valor em reais. `null` vira travessão, não "R$ 0" — ausência não é zero. */
export function formatBRL(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return BRL.format(value);
}

/** Valor compacto em reais, para KPI: "R$ 2,5 mi", "R$ 320 mil". */
export function formatBRLCompact(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `R$ ${(value / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `R$ ${(value / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return BRL.format(value);
}

/** Área em metros quadrados. */
export function formatM2(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${DECIMAL.format(value)} m²`;
}

/** Preço por metro quadrado. */
export function formatPriceM2(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${BRL.format(value)}/m²`;
}

/** Número inteiro com separador de milhar. */
export function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return DECIMAL.format(value);
}

/** Data ISO em formato brasileiro. Entrada inválida devolve travessão. */
export function formatDate(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Escapa os cinco caracteres que quebram contexto HTML.
 *
 * A defesa principal contra XSS neste projeto é construir DOM com `textContent`
 * (R4.4). Esta função existe para os poucos lugares onde uma string precisa ser
 * concatenada em markup — e para deixar o teste de segurança explícito.
 */
export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL externa segura, ou `null`.
 *
 * Só `http:` e `https:` passam. `javascript:`, `data:`, `vbscript:` e afins viram
 * `null` — sem isso, uma célula da planilha viraria execução de script no navegador
 * de quem abre o site (R4.6).
 */
export function safeExternalUrl(value) {
  const raw = String(value === null || value === undefined ? '' : value).trim();
  if (raw === '') return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

/** Domínio de uma URL, para rotular o link da fonte. */
export function hostnameOf(value) {
  const safe = safeExternalUrl(value);
  if (!safe) return '';
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Rótulo legível de tipo de imóvel. O dataset usa snake_case ("casa_condominio");
 * a interface mostra "Casa em condomínio".
 */
const PROPERTY_TYPE_LABELS = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  casa_condominio: 'Casa em condomínio',
  kitnet: 'Kitnet',
  predio: 'Prédio',
  terreno: 'Terreno',
};

export function formatPropertyType(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '—';
  if (PROPERTY_TYPE_LABELS[key]) return PROPERTY_TYPE_LABELS[key];
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Rótulo de `building_orientation` (issue #31). Valor fora do vocabulário some, não quebra. */
const BUILDING_ORIENTATION_LABELS = { vertical: 'Vertical', horizontal: 'Horizontal' };

export function formatBuildingOrientation(value) {
  const key = String(value || '').trim().toLowerCase();
  return BUILDING_ORIENTATION_LABELS[key] || '';
}

/**
 * Vocabulário conhecido de `coordinate_precision`/`confidence_flag`/`coordinate_status`,
 * documentado em `docs/DATA_CONTRACT.md`. O contrato é explícito: esse vocabulário
 * **não é fechado** — a planilha pode trazer valor novo a qualquer momento. Por isso
 * `formatSpatialPrecision` sempre devolve algo legível: usa a tradução conhecida
 * quando existe e cai para "sem underscore, com maiúscula inicial" quando não —
 * nunca o identificador cru de pipeline (issue #21).
 */
const SPATIAL_PRECISION_LABELS = {
  locality_centroid_deterministic_jitter: 'Centro da localidade, com variação controlada',
  locality_centroid_jitter: 'Centro da localidade, com variação',
  low_spatial_high_attribute: 'Atributos confiáveis, localização aproximada',
  low_spatial_high_attributes: 'Atributos confiáveis, localização aproximada',
  medium_spatial_high_attributes: 'Atributos confiáveis, localização parcialmente apurada',
  high_attributes: 'Atributos confiáveis',
  polygon_reference_point: 'Geometria oficial do lote',
  building_reference_point: 'Referência oficial da edificação',
  official_wfs_point: 'Ponto de serviço geográfico oficial',
  school_polygon_reference_point: 'Geometria oficial do lote (escola)',
  user_supplied_reference: 'Referência informada manualmente',
  pending_exact_parcel_or_poi_validation: 'Aguardando validação exata do lote/local',
};

/** Traduz um código técnico de precisão espacial para texto legível em pt-BR. */
export function formatSpatialPrecision(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  if (SPATIAL_PRECISION_LABELS[key]) return SPATIAL_PRECISION_LABELS[key];
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Humaniza um slug: `estacao_metro` → "Estacao metro". Último recurso de rótulo.
 *
 * Exportada porque as camadas de contorno têm vocabulário **aberto** (issue #51): um
 * `layer_group` novo criado no backend precisa aparecer na legenda com um rótulo
 * legível sem passar por mudança de código aqui. Slug cru na tela seria vazamento de
 * detalhe de implementação; sumir seria pior.
 */
export function humanizeSlug(key) {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Rótulo de `sales_stage` de DEVELOPMENTS (issue #30). Vocabulário **fechado** no
 * contrato — mas a planilha é pública e editável, então valor fora do enum é
 * humanizado em vez de sumir: um estágio digitado errado precisa ficar visível para
 * ser corrigido, não desaparecer da tela.
 */
const SALES_STAGE_LABELS = {
  em_construcao: 'Em construção',
  em_lancamento: 'Em lançamento',
  oferta: 'Oferta',
};

export function formatSalesStage(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return SALES_STAGE_LABELS[key] || humanizeSlug(key);
}

/**
 * Rótulo de `regularization_status` (issue #32).
 *
 * Diferente de `sales_stage`, este campo é **texto livre** no backend: o Apps Script
 * não o valida contra enum nenhum. Os três valores abaixo são os esperados, não os
 * únicos possíveis — qualquer outro é humanizado, nunca tratado como se fosse um dos
 * três (mesma lição de R8.16: vocabulário que ninguém previu cai no lado conservador).
 */
const REGULARIZATION_LABELS = {
  regularizado: 'Regularizado',
  nao_regularizado: 'Não regularizado',
  em_regularizacao: 'Em regularização',
};

export function formatRegularizationStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return REGULARIZATION_LABELS[key] || humanizeSlug(key);
}

// --- Âncoras: grupo, segmento e cor no mapa (issues #22, #26, #39) ----------
//
// A classificação de âncora tem dois eixos, provisionados pelo Apps Script v2.0.0:
//
//   `group`    enum FECHADO: `infraestrutura` × `comercio_servico`
//   `segment`  vocabulário ABERTO: o backend infere 12 tipos a partir de
//              category/subcategory/name, e o resto é digitado à mão na planilha
//
// Como a planilha é pública e editável, nenhum dos dois pode ser tratado como
// vocabulário garantido: valor desconhecido é **humanizado**, nunca descartado nem
// exibido como slug cru — mesma escolha de `formatSpatialPrecision` (issue #21).

const ANCHOR_GROUP_LABELS = {
  infraestrutura: 'Infraestrutura',
  comercio_servico: 'Comércio e serviço',
};

/** Rótulo de `group`. Vazio devolve string vazia; valor fora do enum é humanizado. */
export function formatAnchorGroup(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return ANCHOR_GROUP_LABELS[key] || humanizeSlug(key);
}

const ANCHOR_SEGMENT_LABELS = {
  // Inferidos pelo backend (Code.gs, `inferAnchorSegment_`).
  escola: 'Escola',
  universidade: 'Universidade',
  supermercado: 'Supermercado',
  atacado: 'Atacado',
  hospital: 'Hospital',
  laboratorio: 'Laboratório',
  clinica: 'Clínica',
  estacao_metro: 'Estação de metrô',
  estacao_trem: 'Estação de trem',
  terminal_rodoviario: 'Terminal rodoviário',
  aeroporto: 'Aeroporto',
  ponto_onibus: 'Ponto de ônibus',
  // Digitados à mão na planilha (lista fornecida pelo usuário na issue #26).
  department_store: 'Loja de departamento',
  material_construcao: 'Material de construção',
  vestuario: 'Vestuário',
  livraria: 'Livraria',
  cinema: 'Cinema',
  moveis: 'Móveis',
  artigos_esportivos: 'Artigos esportivos',
  academia: 'Academia',
  restaurantes: 'Restaurantes',
  loja_pet: 'Loja de animais',
  posto_combustivel: 'Posto de combustível',
  hotelaria: 'Hotelaria',
};

/**
 * Rótulo de `segment`. Vocabulário aberto: termo que ninguém previu vira texto
 * legível ("food_hall" → "Food hall"), nunca o slug cru na tela.
 */
export function formatAnchorSegment(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return ANCHOR_SEGMENT_LABELS[key] || humanizeSlug(key);
}

/** Vocabulário de `category` de ANCHORS (anterior a `segment`, ver DATA_CONTRACT). */
const ANCHOR_CATEGORY_LABELS = {
  escola: 'Escola',
  mobilidade: 'Mobilidade',
  parque_equipamento_publico: 'Parque / equipamento público',
  saude: 'Saúde',
  shopping_center: 'Shopping center',
  supermercado_atacarejo: 'Supermercado / atacarejo',
  universidade: 'Universidade',
};

/** Rótulo de `category`; categoria fora do vocabulário conhecido também é humanizada. */
export function formatAnchorCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '') return '';
  return ANCHOR_CATEGORY_LABELS[key] || humanizeSlug(key);
}

/**
 * Verde padrão da âncora sem classificação reconhecida. Precisa bater com `--anchor`
 * em `assets/styles.css` — não dá para referenciar a variável CSS aqui porque o
 * Leaflet escreve `fill` como atributo de apresentação SVG (`setAttribute`), que uma
 * regra de folha de estilo (`.marker-anchor { fill: ... }`) sempre vence, mesmo vindo
 * de JS. Por isso essa regra de CSS foi removida (review do PR #40: antes disso, TODA
 * âncora saía verde, porque a regra da classe sobrepunha silenciosamente qualquer
 * `fillColor` passado ao marcador) e a cor — inclusive a de fallback — vem sempre daqui.
 */
export const ANCHOR_FALLBACK_COLOR = '#397d53';

/**
 * Cor por SEGMENTO.
 *
 * A paleta é organizada em famílias de matiz — a família diz "que tipo de coisa é
 * isto" num relance no mapa, e o passo dentro da família separa os segmentos irmãos.
 * O rótulo da legenda é o canal de identidade (nunca a cor sozinha), o que é o que
 * permite mais de 20 entradas sem exigir 20 matizes distinguíveis.
 *
 * As famílias herdam as cores que `category` já usava, para não reeducar quem
 * aprendeu o mapa atual: âmbar = educação, vermelho = saúde, turquesa =
 * abastecimento, azul = mobilidade, roxo = varejo, verde = equipamento público.
 * As famílias novas (magenta = lazer/hospedagem, marrom = construção) foram
 * escolhidas com `scripts/validate_palette.js` da skill `dataviz` — ver a seção
 * "Cores" da PR para a saída real do validador e os pares que continuam próximos.
 */
const ANCHOR_SEGMENT_COLORS = {
  // Mobilidade — azul. Quanto maior a capacidade do modal, mais escuro o tom.
  estacao_metro: '#1f4e79',
  estacao_trem: '#3e7cb1',
  aeroporto: '#4a5da3',
  terminal_rodoviario: '#6d9fcb',
  ponto_onibus: '#93b6d9',
  // Educação e cultura — âmbar.
  escola: '#c9862c',
  universidade: '#8a7a2c',
  livraria: '#b8993d',
  // Saúde — vermelho.
  hospital: '#b1473e',
  clinica: '#d3796d',
  laboratorio: '#83322a',
  // Abastecimento — turquesa.
  supermercado: '#2c9aa3',
  atacado: '#1b6d75',
  posto_combustivel: '#5cb8bf',
  // Varejo — roxo.
  department_store: '#8a4fae',
  vestuario: '#a97cc7',
  moveis: '#673889',
  artigos_esportivos: '#5d2f7d',
  loja_pet: '#c2a3da',
  // Construção e reforma — marrom.
  material_construcao: '#7d5a3c',
  // Lazer, alimentação e hospedagem — magenta.
  cinema: '#8e2f5e',
  academia: '#d16fa8',
  restaurantes: '#b3437f',
  hotelaria: '#e09ac4',
};

/** Cor por CATEGORIA — vocabulário anterior, ainda usado como fallback do segmento. */
const ANCHOR_CATEGORY_COLORS = {
  escola: '#c9862c',
  mobilidade: '#3e7cb1',
  parque_equipamento_publico: '#4f9d5b',
  saude: '#b1473e',
  shopping_center: '#8a4fae',
  supermercado_atacarejo: '#2c9aa3',
  universidade: '#8a7a2c',
};

/**
 * Cor de preenchimento de uma âncora, na ordem em que a informação fica mais fina:
 * `segment` → `category` → verde padrão. Registro que não é âncora devolve `null`,
 * e quem desenha o marcador deixa a cor com o CSS da camada.
 */
export function anchorColor(record) {
  if (!record || record.kind !== 'anchor') return null;
  const segment = String(record.segment || '').trim().toLowerCase();
  if (ANCHOR_SEGMENT_COLORS[segment]) return ANCHOR_SEGMENT_COLORS[segment];
  const category = String(record.category || '').trim().toLowerCase();
  if (ANCHOR_CATEGORY_COLORS[category]) return ANCHOR_CATEGORY_COLORS[category];
  return ANCHOR_FALLBACK_COLOR;
}

/**
 * Cor de uma entrada da legenda. Recebe o par (`segment`, `category`) e passa pela
 * MESMA função do marcador — legenda e mapa não podem resolver cor por caminhos
 * diferentes, ou divergem no primeiro segmento fora do vocabulário.
 */
export function anchorLegendColor({ segment, category }) {
  return anchorColor({ kind: 'anchor', segment, category });
}

/**
 * Entradas de legenda prontas para renderizar, a partir das entradas cruas de
 * `anchorLegendGroups` (`src/filters.js`).
 *
 * Resolve rótulo e cor pela cadeia do marcador e **funde** as entradas que caem no
 * mesmo par (rótulo, cor): `{segment:'escola', category:'escola'}` e
 * `{segment:'escola', category:''}` são a mesma linha da legenda e o mesmo ponto no
 * mapa. O que NÃO se funde é o mesmo rótulo com cores diferentes — aí são de fato
 * dois tons distintos no mapa, e esconder um deixaria um marcador sem legenda.
 *
 * Sai ordenado por rótulo, em pt-BR.
 */
export function anchorLegendEntries(entries) {
  const merged = new Map();

  for (const entry of entries || []) {
    const label = formatAnchorSegment(entry.segment)
      || formatAnchorCategory(entry.category)
      || 'Sem classificação';
    const color = anchorLegendColor(entry);
    const key = `${label}\u0000${color}`;
    if (!merged.has(key)) merged.set(key, { label, color, count: 0 });
    merged.get(key).count += entry.count || 0;
  }

  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

// --- Indicadores por Região Administrativa (issues #34, #35) ----------------

/** Percentual com uma casa: `18.24` → "18,2%". Ausente devolve travessão. */
export function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * As cinco faixas etárias de `RA_PROFILES`, na ordem em que se lê uma pirâmide
 * etária. A ordem é fixa e não alfabética: `population_age_60_plus_pct` viria antes
 * de `population_age_0_14_pct` numa ordenação por nome, e uma distribuição etária
 * fora de ordem deixa de ser legível como distribuição.
 *
 * Rótulos curtos porque a coluna deles é fixa e estreita: "60 ou mais" quebrava em
 * duas linhas em 390 px e derrubava a barra daquela linha para fora do alinhamento
 * das outras quatro — comprimento comparável exige que todas comecem na mesma coluna.
 * A legenda do gráfico ("População por faixa etária") é quem diz que são idades.
 */
const RA_AGE_BANDS = [
  ['population_age_0_14_pct', '0–14'],
  ['population_age_15_29_pct', '15–29'],
  ['population_age_30_44_pct', '30–44'],
  ['population_age_45_59_pct', '45–59'],
  ['population_age_60_plus_pct', '60+'],
];

/**
 * Teto da soma que ainda conta como escala decimal.
 *
 * É o MESMO teto que `validateRaProfile_()` no Apps Script usa para aceitar a
 * distribuição (`Math.abs(sum - 1) <= 0.02`). Cortar antes — em 1,01, como esta
 * função fazia — criava uma faixa de valores que o servidor aceita como escala
 * decimal e a tela desenhava como porcento: `0,20 + 0,20 + 0,20 + 0,20 + 0,219`
 * soma 1,019, passa na validação do backend e virava "0,2%" em vez de "20,0%",
 * subestimando toda faixa etária em 100× (P2 do review do Codex na PR #44).
 *
 * O piso do servidor (`sum >= 0,98`) NÃO é espelhado de propósito: ele descreve uma
 * distribuição COMPLETA, e aqui a distribuição pode estar parcial. Duas faixas
 * decimais somando 0,35 são escala decimal legítima e precisam ser convertidas — o
 * que denuncia a composição incompleta é o `total`, não a escala.
 */
const DECIMAL_SCALE_MAX_SUM = 1.02;

/**
 * Distribuição etária de uma RA, pronta para desenhar.
 *
 * Três coisas que o contrato obriga a tratar aqui, e que são a razão de isto ser
 * função pura com teste em vez de código de DOM:
 *
 * 1. **A coluna existe, o dado pode não existir.** A cobertura do PDAD é esparsa
 *    (`0/35` hoje). Faixa sem valor é OMITIDA — não vira barra de zero, que afirmaria
 *    que ninguém naquela RA tem entre 0 e 14 anos.
 * 2. **A escala pode vir em porcento ou em decimal.** `docs/DATA_CONTRACT.md` aceita
 *    as duas ("aproximadamente 100%, ou 1, em escala decimal"), então a planilha pode
 *    trazer `18.2` ou `0.182`. Desenhar `0.182` numa escala de porcento daria cinco
 *    barras invisíveis. A conversão só acontece quando ela é inequívoca: pelo menos
 *    duas faixas publicadas, todas ≤ 1, e a soma dentro do teto que o servidor usa
 *    para aceitar a escala decimal — três condições que uma distribuição em porcento
 *    não satisfaz.
 * 3. **A soma pode não fechar 100.** Com faixas faltando ou com divergência que o
 *    servidor registrou como `AGE_DISTRIBUTION_SUM`, a composição está incompleta —
 *    e `total` sai junto para a interface poder dizer isso em vez de apresentar um
 *    todo que não é o todo (R8.15).
 *
 * Devolve `{ bands, total, scaledFromDecimal }`; `bands` vazio quando não há
 * distribuição nenhuma.
 */
export function raAgeBands(profile) {
  const present = [];
  for (const [key, label] of RA_AGE_BANDS) {
    const value = profile ? profile[key] : null;
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    present.push({ key, label, pct: value });
  }
  if (present.length === 0) {
    return { bands: [], total: null, scaledFromDecimal: false, scaleWarning: null };
  }

  const sum = present.reduce((acc, b) => acc + b.pct, 0);
  const scaledFromDecimal = present.length >= 2
    && present.every((b) => b.pct >= 0 && b.pct <= 1)
    && sum <= DECIMAL_SCALE_MAX_SUM;

  const bands = scaledFromDecimal
    // A conversão é declarada: `percentFromDecimal`, e não uma multiplicação por 100
    // solta no meio do código. Trocar por `percentFromPoints` vira uma linha visível
    // no diff em vez de um `* 100` que some (issue #54).
    ? present.map((b) => ({ ...b, pct: percentFromDecimal(b.pct) }))
    : present.map((b) => ({ ...b, pct: percentFromPoints(b.pct) }));

  // A escala canônica de RA_PROFILES é pontos percentuais. Converter em silêncio o que
  // chega em decimal esconderia uma divergência entre a planilha e o contrato: hoje é
  // conversão certa, amanhã pode ser coluna trocada. O aviso é a diferença entre
  // "o cliente se virou" e "alguém precisa olhar isto" (R5.7).
  // Faixa acima de 100 não é escala trocada — é valor impossível: nenhuma parcela da
  // população é maior que a população. O caminho real que produz isso hoje é a
  // ambiguidade documentada de `toNumber`, que lê a célula "0,182" como 182 (vírgula
  // com exatamente três casas vira separador de milhar). Sem esta checagem a barra é
  // desenhada, o número é formatado, e "182,0%" tem exatamente a mesma aparência de um
  // dado correto.
  const impossible = bands.filter((b) => b.pct > 100);

  let scaleWarning = null;
  if (impossible.length > 0) {
    scaleWarning = `Faixa etária acima de 100% da população (${impossible
      .map((b) => `${b.label}: ${Math.round(b.pct)}%`).join(', ')}). `
      + 'O valor está fora da faixa possível e não descreve uma parcela da população — '
      + 'confira a célula na planilha.';
  } else if (scaledFromDecimal) {
    scaleWarning = 'As faixas etárias vieram em escala decimal (0–1) e foram convertidas '
      + 'para porcento. A escala esperada em RA_PROFILES é '
      + `${DATASET_PERCENT_SCALE.RA_PROFILES === PERCENT_SCALES.POINTS ? 'pontos percentuais (0–100)' : 'decimal'}.`;
  }

  return {
    bands,
    total: bands.reduce((acc, b) => acc + b.pct, 0),
    scaledFromDecimal,
    scaleWarning,
  };
}

// --- Contornos: vocabulário de camada e estilo cartográfico (issues #51, #52) ----

/**
 * Texto de um campo já normalizado.
 *
 * `normalizePolygon()` devolve string em todo campo de texto, mas esta função também é
 * chamada com linha crua em teste e a partir do `properties_json`, onde o tipo é do
 * arquivo, não do contrato. Local de propósito: `format.js` não importa `normalize.js`,
 * e criar essa dependência só por uma coerção de três linhas acoplaria as duas camadas.
 */
function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Rótulos dos `layer_group` conhecidos. Vocabulário **aberto**: o backend pode criar
 * um grupo novo sem passar por aqui, e ele aparece na legenda humanizado
 * (`humanizeSlug`) em vez de vazar o slug ou sumir.
 */
const POLYGON_LAYER_GROUP_LABELS = {
  administrative_regions: 'Regiões administrativas',
  road_network: 'Malha rodoviária',
  poligonais_importadas: 'Poligonais importadas',
};

/** Rótulos dos `entity_type` conhecidos. Mesma regra de vocabulário aberto. */
const POLYGON_ENTITY_TYPE_LABELS = {
  administrative_region: 'Região administrativa',
  road_segment: 'Trecho rodoviário',
  custom_area: 'Área customizada',
};

/**
 * Grupo/tipo de um contorno sem classificação.
 *
 * Dado gravado antes da v2.2.1 não tem `layer_group` nem `entity_type`. Ele NÃO pode
 * sumir do mapa por isso — some sem erro é a pior falha possível aqui —, então cai num
 * grupo "Outros" que a legenda mostra como qualquer outro.
 */
export const POLYGON_UNCLASSIFIED = '__outros__';

export function polygonLayerGroup(polygon) {
  const raw = asText(polygon ? polygon.layer_group : '');
  return raw || POLYGON_UNCLASSIFIED;
}

export function polygonEntityType(polygon) {
  const raw = asText(polygon ? polygon.entity_type : '');
  return raw || POLYGON_UNCLASSIFIED;
}

export function formatLayerGroup(key) {
  if (!key || key === POLYGON_UNCLASSIFIED) return 'Outros';
  return POLYGON_LAYER_GROUP_LABELS[key] || humanizeSlug(key);
}

export function formatEntityType(key) {
  if (!key || key === POLYGON_UNCLASSIFIED) return 'Sem tipo declarado';
  return POLYGON_ENTITY_TYPE_LABELS[key] || humanizeSlug(key);
}

/** Estilo de contorno quando a planilha não declara nada. Constante, nunca regra de CSS. */
export const POLYGON_FALLBACK_STYLE = Object.freeze({
  color: '#5b6b8c',
  fillColor: '#5b6b8c',
  fillOpacity: 0.15,
  weight: 2,
});

/** `#rgb` ou `#rrggbb`. Qualquer outra coisa não é cor utilizável num atributo SVG. */
function validHexColor(value) {
  const text = asText(value);
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : null;
}

/**
 * Espessura máxima aceita para o traço.
 *
 * Não existe para "validar" no sentido burocrático: um `stroke_width` de 400 vindo de
 * um erro de digitação na planilha desenharia uma faixa que cobre o mapa inteiro, e o
 * sintoma (mapa cinza) não aponta para a célula que o causou.
 */
const MAX_STROKE_WIDTH = 12;

/**
 * Estilo cartográfico de um contorno, vindo do backend e **validado** (issue #52).
 *
 * O backend grava `fill_color`, `stroke_color`, `fill_opacity`, `stroke_width` — as RAs
 * com a cor oficial do GeoPortal, as rodovias com cinza-ardósia. Cada valor é conferido
 * antes de virar atributo: cor fora de `#rrggbb`, opacidade fora de 0–1 ou espessura não
 * numérica caem no fallback, em vez de virar atributo SVG inválido que o navegador
 * ignora em silêncio — e "ignora em silêncio" aqui significa um contorno invisível sem
 * nenhum erro no console.
 *
 * `color` (a coluna legada) continua valendo como fallback antes da constante, para que
 * contorno importado de KML antes da v2.2.1 não perca a cor que já tinha.
 *
 * A cor sai daqui para `fillColor`/`color` no JS e **nunca** para uma regra de classe no
 * CSS: regra de classe vence o atributo que o Leaflet escreve no SVG, e foi assim que
 * todas as âncoras acabaram verdes na PR #40 (R8.31, R8.45).
 */
export function polygonStyle(polygon) {
  const legacy = validHexColor(polygon ? polygon.color : '');
  const stroke = validHexColor(polygon ? polygon.stroke_color : '')
    || legacy || POLYGON_FALLBACK_STYLE.color;
  const fill = validHexColor(polygon ? polygon.fill_color : '')
    || legacy || POLYGON_FALLBACK_STYLE.fillColor;

  const rawOpacity = polygon ? polygon.fill_opacity : null;
  const fillOpacity = Number.isFinite(rawOpacity) && rawOpacity >= 0 && rawOpacity <= 1
    ? rawOpacity
    : POLYGON_FALLBACK_STYLE.fillOpacity;

  const rawWeight = polygon ? polygon.stroke_width : null;
  const weight = Number.isFinite(rawWeight) && rawWeight > 0 && rawWeight <= MAX_STROKE_WIDTH
    ? rawWeight
    : POLYGON_FALLBACK_STYLE.weight;

  return { color: stroke, fillColor: fill, fillOpacity, weight };
}

/**
 * Profundidade padrão de cada grupo, usada só quando `z_index` está ausente.
 *
 * Existe porque a ordem de desenho hoje é **acidental**: os contornos entram na ordem
 * em que chegam da planilha, então uma Região Administrativa pode cobrir uma rodovia
 * por sorteio — e cobrir significa roubar o clique também, não só a cor. Área grande
 * embaixo, corredor estreito em cima é a única ordem que deixa os dois utilizáveis.
 *
 * Grupo desconhecido vai para cima: quem acabou de criar uma camada quer vê-la.
 */
const POLYGON_GROUP_DEPTH = {
  administrative_regions: 0,
  poligonais_importadas: 1,
  // Contorno gravado antes da v2.2.1 não tem `layer_group`, e ele NÃO é uma camada
  // nova: é justamente um KML importado, quase sempre uma área grande. Deixá-lo no topo
  // junto com os grupos desconhecidos faria um contorno legado cobrir as rodovias — e
  // cobrir rouba o clique, não só a cor.
  [POLYGON_UNCLASSIFIED]: 1,
  road_network: 2,
};
const UNKNOWN_GROUP_DEPTH = 3;

/**
 * Ordem de desenho: menor primeiro, maior por cima (issue #52).
 *
 * `z_index` declarado vence sempre e ordena numericamente. Ausente vai para o fim da
 * fila, e lá a ordem é a profundidade do grupo — não a ordem das linhas da planilha,
 * que muda quando alguém insere uma linha e faria o empilhamento mudar entre
 * recarregamentos sem nada ter mudado no dado.
 *
 * O desempate final é o `id`, não a posição no array: `Array.prototype.sort` é estável,
 * mas estabilidade só preserva a ordem de ENTRADA — e é exatamente a ordem de entrada
 * que não é confiável aqui.
 */
export function comparePolygonDrawOrder(a, b) {
  const za = Number.isFinite(a && a.z_index) ? a.z_index : null;
  const zb = Number.isFinite(b && b.z_index) ? b.z_index : null;

  if (za !== null && zb !== null && za !== zb) return za - zb;
  if (za !== null && zb === null) return -1;
  if (za === null && zb !== null) return 1;

  if (za === null && zb === null) {
    const da = POLYGON_GROUP_DEPTH[polygonLayerGroup(a)];
    const db = POLYGON_GROUP_DEPTH[polygonLayerGroup(b)];
    const depthA = da === undefined ? UNKNOWN_GROUP_DEPTH : da;
    const depthB = db === undefined ? UNKNOWN_GROUP_DEPTH : db;
    if (depthA !== depthB) return depthA - depthB;
  }

  return String(a && a.id).localeCompare(String(b && b.id));
}

/** Contornos na ordem em que devem ser desenhados. Não muta a lista recebida. */
export function sortPolygonsForDraw(polygons) {
  return [...(polygons || [])].sort(comparePolygonDrawOrder);
}

// --- Perfil da Região Administrativa no painel de detalhe (issue #53) --------------

/**
 * Indicadores ESSENCIAIS de uma RA, na ordem em que devem ser lidos.
 *
 * Seis itens, não trinta. O painel de contorno hoje percorre `properties_json` em ordem
 * alfabética usando a chave crua como rótulo, e numa RA isso são ~30 linhas que começam
 * em `avg_household_size` e passam por `geometry_source_hash` antes de chegar em
 * `population_total` — o que o usuário veio ver fica abaixo do que ele nunca vai olhar.
 *
 * Indicador sem valor é OMITIDO, nunca vira travessão nem linha vazia: a cobertura do
 * PDAD é esparsa e `null` aqui significa "não publicado", que é diferente de zero
 * (mesma razão da issue #35). Uma RA sem nenhum indicador devolve lista vazia, e quem
 * renderiza decide o que fazer — não existe "perfil vazio" desenhado na tela.
 */
const AGE_DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function raProfileEssentials(profile) {
  if (!profile) return [];
  const rows = [];
  const add = (label, value) => { if (value !== null && value !== undefined) rows.push({ label, value }); };

  add('População', profile.population_total === null ? null : formatNumber(profile.population_total));
  add('Densidade', profile.population_density_km2 === null
    ? null : `${formatNumber(Math.round(profile.population_density_km2))} hab/km²`);
  add('Renda per capita', profile.income_per_capita_brl === null
    ? null : formatBRL(profile.income_per_capita_brl));
  // Idade média com uma casa: `formatNumber` arredonda para inteiro, e "34 anos" no
  // lugar de "34,2 anos" perde a única casa que distingue duas RAs vizinhas.
  add('Idade média', profile.average_age === null
    ? null : `${AGE_DECIMAL.format(profile.average_age)} anos`);
  add('Domicílios', profile.households_total === null ? null : formatNumber(profile.households_total));
  // `area_km2` vem do limite oficial do GeoPortal, não do cálculo planar aproximado do
  // cliente — é medida publicada, não estimativa nossa.
  add('Área', profile.area_km2 === null
    ? null : `${formatNumber(Math.round(profile.area_km2))} km²`);

  return rows;
}

// --- Escala percentual declarada por dataset (issue #54) ---------------------------

/**
 * As duas convenções de porcentagem que este backend usa — ao mesmo tempo, em abas
 * diferentes, em campos que se parecem e significam o contrário:
 *
 * - `RA_PROFILES.female_pct = 54` quer dizer **54%** (pontos percentuais);
 * - `IVV_MONTHLY.ivv_pct = 0.057` quer dizer **5,7%** (escala decimal).
 *
 * Trocar uma pela outra erra por 100× **sem exceção e sem sintoma**: 5,7% vira 0,057%
 * e 54% vira 5400%. O primeiro passa por "número pequeno", o segundo por "erro de
 * digitação na planilha" — nenhum dos dois parece um bug de código. É a mesma família
 * da R8.44.
 *
 * Por isso a escala é **declarada em cada chamada**, nunca inferida do valor: um
 * `0,54` é escala decimal legítima e é também um `0,54%` legítimo, e nenhuma heurística
 * distingue os dois olhando só para o número.
 */
export const PERCENT_SCALES = Object.freeze({
  POINTS: 'points',
  DECIMAL: 'decimal',
});

/**
 * Escala canônica de cada dataset, do lado do backend que a produz.
 *
 * Serve para NOMEAR a expectativa, não para converter automaticamente: o que chega
 * fora da escala canônica do seu dataset vira aviso, não conversão calada.
 */
export const DATASET_PERCENT_SCALE = Object.freeze({
  RA_PROFILES: PERCENT_SCALES.POINTS,
  IVV_MONTHLY: PERCENT_SCALES.DECIMAL,
});

/**
 * Percentual a partir de pontos percentuais: `54` → `54`. Identidade, e existe
 * justamente por isso — a chamada declara a escala de origem em vez de deixá-la
 * implícita, e trocar esta função pela outra vira uma mudança visível no diff.
 *
 * Ausência devolve `null`, nunca `0`: campo vazio não é "0% da população" (R5.7).
 */
export function percentFromPoints(value) {
  return Number.isFinite(value) ? value : null;
}

/** Percentual a partir da escala decimal: `0.057` → `5.7`. Ausência devolve `null`. */
export function percentFromDecimal(value) {
  return Number.isFinite(value) ? value * 100 : null;
}

/**
 * RA cujo perfil estatístico ainda não existe — e por quê (issue #54).
 *
 * `26 de Setembro` e `Ponte Alta` foram criadas depois da PDAD-A 2024, então população,
 * renda e faixas etárias estão vazias e vão continuar vazias até a próxima pesquisa.
 * Sem esta função a tela some com o bloco inteiro, e "some" é indistinguível de "o
 * carregamento falhou" — o operador fica sem saber se procura o dado ou o defeito.
 *
 * `predecessor_ra` vai junto porque é a resposta prática: até a PDAD nova sair, o perfil
 * que descreve aquele território é o da RA de origem.
 */
export const RA_PROFILE_PENDING_STATUS = 'not_available_created_after_pdad_2024';

export function raProfileUnavailability(profile) {
  if (!profile || profile.profile_status !== RA_PROFILE_PENDING_STATUS) return null;

  const parts = ['Dados estatísticos ainda não disponíveis'];
  parts.push('esta Região Administrativa foi criada depois da PDAD-A 2024');
  if (profile.predecessor_ra) {
    parts.push(`o território era parte de ${profile.predecessor_ra}`);
  }
  return {
    status: profile.profile_status,
    predecessor: profile.predecessor_ra || null,
    message: `${parts[0]}: ${parts.slice(1).join('; ')}.`,
  };
}
