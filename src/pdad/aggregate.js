// Agregação de PDAD_A_DATA por Região Administrativa (issue #100, tela Diagnóstico).
//
// `normalize-pdad.js` devolve linhas soltas; este arquivo agrupa em uma estrutura por
// ano -> RA -> indicador -> categorias, que é como a tela consome. Duas coisas que este
// arquivo existe para não deixar passar:
//
// 1. **Categoria suprimida/parcial nunca vira `0`.** Uma categoria sem valor publicado
//    sai da lista ordenada com o status preservado; quem renderiza decide como
//    representar ausência, nunca como barra de tamanho zero (R5.7).
// 2. **"Todas as RAs" é MÉDIA das categorias, não soma.** Somar percentuais de RAs
//    diferentes não tem significado; os dois KPIs de contagem (população, domicílios)
//    são a exceção — esses somam, porque são contagem, não percentual.
//
// Funções puras. Sem DOM, sem rede.

import {
  PDAD_INDICATORS, POPULATION_INDICATOR_CODE, HOUSEHOLDS_INDICATOR_CODE,
  AGE_BUCKET_BY_CATEGORY, AGE_DISPLAY_BUCKETS,
  SHOPPING_GROUP_BY_CODE, SHOPPING_GROUP_TITLE_BY_SLUG, INDICATOR_CODES_BY_KEY,
} from './indicators.js';

const AGE_INDICATOR_KEY = 'age';
const SHOPPING_INDICATOR_KEY = 'shopping';

/**
 * Rótulo de exibição de uma categoria.
 *
 * Várias abas "de resposta múltipla" (água, esgoto, energia, internet, serviço
 * doméstico…) publicam um segundo eixo (`segment_value`, ex.: "Rede Geral") cruzado com
 * a resposta (`response_category`, ex.: "Sim"). Quando os dois existem e são
 * diferentes, o rótulo compõe os dois — "Rede Geral · Sim" — do jeito que o protótipo de
 * referência já fazia. Indicador sem segmento (estado civil, CNH…) usa só a categoria.
 */
export function categoryLabel(item) {
  const segmento = item.segmentValue;
  const categoria = item.responseCategory || item.categoryRaw || '';
  if (segmento && segmento.toLowerCase() !== categoria.toLowerCase()) {
    return `${segmento} · ${categoria}`;
  }
  return categoria;
}

function ensureRa(porRa, item) {
  let ra = porRa.get(item.raGeoId);
  if (!ra) {
    ra = {
      raGeoId: item.raGeoId,
      raName: item.raName || item.raGeoId,
      population: 0,
      households: 0,
      recordCount: 0,
      ageBuckets: new Map(),
      indicators: new Map(),
    };
    porRa.set(item.raGeoId, ra);
  }
  if (item.raName && (!ra.raName || ra.raName === ra.raGeoId)) ra.raName = item.raName;
  ra.recordCount += 1;
  return ra;
}

/**
 * Acumula uma linha de `age_sex_distribution` no bucket de 5 faixas da RA.
 *
 * A planilha publica `estimate_pct` como composição de SEXO dentro da faixa (ex.: 49%
 * do "até 4 anos" é mulher) — não é participação da faixa na população. Por isso a
 * faixa etária de exibição soma `estimate_total` bruto (contagem), nunca `estimate_pct`;
 * o percentual final vem depois, dividindo pelo total geral.
 */
function accumulateAge(ra, item) {
  if (item.isCategoryTotal) return;
  const bucket = AGE_BUCKET_BY_CATEGORY[item.categoryStandard];
  if (!bucket) return;
  const total = Number.isFinite(item.estimateTotal) ? item.estimateTotal : 0;
  ra.ageBuckets.set(bucket, (ra.ageBuckets.get(bucket) || 0) + total);
  ra.population += total;
}

function accumulateHouseholds(ra, item) {
  if (item.isCategoryTotal) return;
  const total = Number.isFinite(item.estimateTotal) ? item.estimateTotal : 0;
  ra.households += total;
}

/**
 * Acumula uma categoria "normal" (não `age_sex_distribution`) num indicador da RA.
 *
 * Categoria repetida na planilha (mesma RA/ano/indicador/rótulo) mantém a primeira
 * publicada; uma suprimida é substituída se uma versão publicada da mesma categoria
 * aparecer depois — nunca o contrário, porque "publicado" é sempre mais informativo que
 * "suprimido" (R8.54: publicado vence).
 */
function accumulateIndicator(ra, item, meta) {
  if (item.isCategoryTotal) return;
  let indicador = ra.indicators.get(meta.key);
  if (!indicador) {
    indicador = { key: meta.key, label: meta.label, tema: meta.tema, unit: meta.unit, values: new Map() };
    ra.indicators.set(meta.key, indicador);
  }
  const rotulo = categoryLabel(item);
  const atual = indicador.values.get(rotulo);
  const suprimido = item.sourceValueStatus === 'suppressed';
  if (!atual || (atual.status === 'suppressed' && !suprimido)) {
    indicador.values.set(rotulo, {
      label: rotulo,
      pct: item.estimatePct,
      total: item.estimateTotal,
      status: item.sourceValueStatus || null,
    });
  }
}

/**
 * O grupo (tipo de compra) e o destino (local) de uma linha de "Local de compras"
 * (Figura 59, issue #102).
 *
 * Cinco `indicator_code` publicam a mesma Figura com formatos diferentes:
 * `purchase_locations` já traz o tipo de compra em `segment_value` (slug) e o local em
 * `response_category` — direto. Os outros quatro (`purchase_appliances` etc.) têm o
 * tipo de compra implícito no próprio `indicator_code`; quando o local foi PUBLICADO,
 * ele mora em `response_category` (e `segment_value` repete o tipo de compra, redundante);
 * quando é SUPRIMIDO, `response_category` vem vazio e o local sobra em `segment_value`
 * — achado real na planilha, os dois formatos coexistem para o mesmo indicador.
 *
 * Devolve `null` quando a linha não tem grupo/destino reconhecível — inclui os 17
 * resquícios de extração já descartados em `normalize-pdad.js`.
 */
function shoppingGroupAndDestination(item) {
  if (item.indicatorCode === 'purchase_locations') {
    const grupo = SHOPPING_GROUP_TITLE_BY_SLUG[item.segmentValue];
    const destino = item.responseCategory;
    return (grupo && destino) ? { grupo, destino } : null;
  }
  const grupo = SHOPPING_GROUP_BY_CODE[item.indicatorCode];
  const destino = item.responseCategory || item.segmentValue;
  return (grupo && destino) ? { grupo, destino } : null;
}

/** Acumula uma linha de "Local de compras" (Figura 59) no grupo (tipo) × destino da RA. */
function accumulateShopping(ra, item, meta) {
  if (item.isCategoryTotal) return;
  const gd = shoppingGroupAndDestination(item);
  if (!gd) return;

  let indicador = ra.indicators.get(meta.key);
  if (!indicador) {
    indicador = { key: meta.key, label: meta.label, tema: meta.tema, unit: meta.unit, groups: new Map() };
    ra.indicators.set(meta.key, indicador);
  }
  if (!indicador.groups.has(gd.grupo)) indicador.groups.set(gd.grupo, new Map());
  const porDestino = indicador.groups.get(gd.grupo);
  const atual = porDestino.get(gd.destino);
  const suprimido = item.sourceValueStatus === 'suppressed';
  if (!atual || (atual.status === 'suppressed' && !suprimido)) {
    porDestino.set(gd.destino, {
      label: gd.destino, pct: item.estimatePct, total: item.estimateTotal, status: item.sourceValueStatus || null,
    });
  }
}

/** Faixas etárias finalizadas: as 5 de exibição, na ordem certa, com ausência preservada. */
function finalizeAge(ra) {
  const total = ra.population || 0;
  const valores = AGE_DISPLAY_BUCKETS.map((bucket) => {
    const soma = ra.ageBuckets.get(bucket);
    if (!Number.isFinite(soma) || total <= 0) return { label: bucket, pct: null, total: soma ?? null, status: null };
    return { label: bucket, pct: (soma / total) * 100, total: soma, status: 'calculated' };
  });
  ra.indicators.set('age', {
    key: 'age', label: 'Faixa etária', tema: 'moradores', unit: '% da população', values: valores,
  });
}

/**
 * Ordena as categorias de um indicador por percentual decrescente, ausência ao final.
 *
 * Aceita tanto um `Map` (o acumulador de `accumulateIndicator`) quanto um array (o
 * resultado já achatado de `indicatorSeries`) — `Array.from` cobre os dois sem exigir
 * que quem chama saiba qual é qual.
 */
function sortedValues(values) {
  return Array.from(values instanceof Map ? values.values() : values).sort((a, b) => {
    const av = Number.isFinite(a.pct) ? a.pct : -1;
    const bv = Number.isFinite(b.pct) ? b.pct : -1;
    return bv - av;
  });
}

/**
 * Agrupa as linhas normalizadas em `ano -> RA -> { população, domicílios, indicadores }`.
 *
 * `age_sex_distribution` e `dwelling_type` alimentam os dois KPIs de contagem (issue
 * #100) além de virarem cards; as demais linhas viram categorias do indicador
 * correspondente em `PDAD_INDICATORS`. Indicador fora do registro é ignorado aqui —
 * continua disponível em `rows` para quem precisar do dado bruto.
 */
export function buildPdadIndex(rows) {
  const porAno = new Map();

  for (const item of Array.isArray(rows) ? rows : []) {
    if (!Number.isFinite(item.pdadYear)) continue;
    if (!porAno.has(item.pdadYear)) porAno.set(item.pdadYear, new Map());
    const porRa = porAno.get(item.pdadYear);
    const ra = ensureRa(porRa, item);

    if (item.indicatorCode === POPULATION_INDICATOR_CODE) {
      accumulateAge(ra, item);
      continue;
    }
    if (item.indicatorCode === HOUSEHOLDS_INDICATOR_CODE) {
      accumulateHouseholds(ra, item);
    }
    const meta = PDAD_INDICATORS[item.indicatorCode];
    if (!meta) continue;
    if (meta.key === SHOPPING_INDICATOR_KEY) accumulateShopping(ra, item, meta);
    else accumulateIndicator(ra, item, meta);
  }

  const anos = {};
  for (const [ano, porRa] of porAno) {
    const ras = {};
    for (const [id, ra] of porRa) {
      finalizeAge(ra);
      const avgHouseholdSize = ra.households > 0 ? ra.population / ra.households : null;
      const indicadores = {};
      for (const [key, indicador] of ra.indicators) {
        if (key === SHOPPING_INDICATOR_KEY) {
          indicadores[key] = {
            ...indicador,
            groups: [...indicador.groups.entries()]
              .map(([grupo, porDestino]) => ({ group: grupo, items: sortedValues(porDestino) }))
              .sort((a, b) => a.group.localeCompare(b.group, 'pt-BR')),
          };
          continue;
        }
        indicadores[key] = {
          ...indicador,
          values: key === AGE_INDICATOR_KEY ? indicador.values : sortedValues(indicador.values),
        };
      }
      ras[id] = {
        raGeoId: ra.raGeoId,
        raName: ra.raName,
        population: ra.population || 0,
        households: ra.households || 0,
        avgHouseholdSize,
        recordCount: ra.recordCount,
        indicators: indicadores,
      };
    }
    anos[ano] = ras;
  }
  return anos;
}

/** As RAs de um ano, em ordem alfabética pt-BR — a ordem usada nos seletores da tela. */
export function rasForYear(index, year) {
  const ras = index[year] ? Object.values(index[year]) : [];
  return [...ras].sort((a, b) => a.raName.localeCompare(b.raName, 'pt-BR'));
}

/**
 * KPIs agregados para um recorte de RAs (issue #100).
 *
 * População e domicílios SOMAM entre as RAs selecionadas — são contagem. Moradores por
 * domicílio é recalculado da soma (`população ÷ domicílios`), nunca a média das razões
 * por RA, que erraria para RAs de tamanhos muito diferentes.
 */
export function summarizeKpis(index, year, raGeoIds) {
  const ras = (index[year] ? raGeoIds.map((id) => index[year][id]).filter(Boolean) : []);
  const population = ras.reduce((soma, ra) => soma + ra.population, 0);
  const households = ras.reduce((soma, ra) => soma + ra.households, 0);
  return {
    population,
    households,
    avgHouseholdSize: households > 0 ? population / households : null,
    raCount: ras.length,
  };
}

/**
 * Categorias de um indicador, agregadas entre as RAs selecionadas (issue #100).
 *
 * Uma RA só: devolve as categorias dela, como vieram. Mais de uma RA: MÉDIA do
 * percentual entre as RAs que publicaram aquela categoria — nunca soma, que não tem
 * significado para percentual, e nunca inclui RA sem publicação no denominador, que
 * puxaria a média para baixo por ausência de dado, não por ausência de gente (R5.7).
 */
export function indicatorSeries(index, year, raGeoIds, indicatorKey) {
  const ras = (index[year] ? raGeoIds.map((id) => index[year][id]).filter(Boolean) : []);
  if (ras.length === 0) return [];
  if (ras.length === 1) return ras[0].indicators[indicatorKey]?.values || [];

  const somas = new Map();
  for (const ra of ras) {
    const indicador = ra.indicators[indicatorKey];
    if (!indicador) continue;
    for (const valor of indicador.values) {
      if (!Number.isFinite(valor.pct)) continue;
      const atual = somas.get(valor.label) || { soma: 0, n: 0 };
      atual.soma += valor.pct;
      atual.n += 1;
      somas.set(valor.label, atual);
    }
  }
  const resultado = [...somas.entries()].map(([label, { soma, n }]) => ({
    label, pct: soma / n, total: null, status: 'calculated',
  }));

  // Faixa etária tem ordem cronológica fixa (0–14 … 60+), não ordem por valor — é a
  // mesma leitura de pirâmide etária das demais telas do site.
  if (indicatorKey === AGE_INDICATOR_KEY) {
    const porLabel = new Map(resultado.map((item) => [item.label, item]));
    return AGE_DISPLAY_BUCKETS.map(
      (bucket) => porLabel.get(bucket) || { label: bucket, pct: null, total: null, status: null },
    );
  }
  return sortedValues(resultado);
}

/**
 * Grupos (tipo de compra) × destinos de "Local de compras", agregados entre as RAs
 * selecionadas — mesma regra de `indicatorSeries` (uma RA só devolve como veio; mais de
 * uma faz MÉDIA por destino, nunca soma), só que em dois níveis em vez de um.
 */
export function indicatorGroups(index, year, raGeoIds, indicatorKey = SHOPPING_INDICATOR_KEY) {
  const ras = (index[year] ? raGeoIds.map((id) => index[year][id]).filter(Boolean) : []);
  if (ras.length === 0) return [];
  if (ras.length === 1) return ras[0].indicators[indicatorKey]?.groups || [];

  const somas = new Map();
  for (const ra of ras) {
    const indicador = ra.indicators[indicatorKey];
    if (!indicador) continue;
    for (const grupo of indicador.groups) {
      if (!somas.has(grupo.group)) somas.set(grupo.group, new Map());
      const porDestino = somas.get(grupo.group);
      for (const item of grupo.items) {
        if (!Number.isFinite(item.pct)) continue;
        const atual = porDestino.get(item.label) || { soma: 0, n: 0 };
        atual.soma += item.pct;
        atual.n += 1;
        porDestino.set(item.label, atual);
      }
    }
  }
  return [...somas.entries()]
    .map(([group, porDestino]) => ({
      group,
      items: sortedValues(
        [...porDestino.entries()].map(([label, { soma, n }]) => ({
          label, pct: soma / n, total: null, status: 'calculated',
        })),
      ),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, 'pt-BR'));
}

/**
 * Metadados de cada `indicator_code` (Figura, Tabela, universo, notas…), derivados da
 * PRIMEIRA linha vista — são constantes por indicador, não por RA. Alimenta o
 * cabeçalho do drill-down (issue #102), sem precisar de um `FIGURE_MAP` separado do
 * protótipo: o dado já carrega a própria procedência em cada linha.
 */
export function buildFigureMeta(rows) {
  const out = new Map();
  for (const item of Array.isArray(rows) ? rows : []) {
    if (!item.indicatorCode || out.has(item.indicatorCode)) continue;
    out.set(item.indicatorCode, {
      indicatorCode: item.indicatorCode,
      indicatorName: item.indicatorName,
      figureNumber: item.figureNumber,
      tableNumber: item.tableNumber,
      section: item.section,
      universe: item.universe,
      segmentation: item.figureSegmentation,
      structure: item.figureDataStructure,
      notes: item.figureQualityNotes || item.notes || '',
      figurePdfPage: item.figurePdfPage,
      tablePdfPage: item.tablePdfPage,
      sourceInstitution: item.sourceInstitution,
    });
  }
  return out;
}

/**
 * Linhas cruas de uma RA/ano para um indicador — a base do drill-down (issue #102):
 * rastreabilidade até a Figura/Tabela de origem, não só o percentual consolidado.
 *
 * `key` (não `indicator_code`) é o que a tela passa, porque um clique parte de um
 * cartão, que só conhece a chave de exibição — `INDICATOR_CODES_BY_KEY` resolve para
 * um ou mais `indicator_code` (mais de um só para `shopping`, que é uma Figura só
 * fatiada em cinco códigos).
 */
export function detailRowsForKey(rows, { raGeoId, year, key }) {
  const codigos = new Set(INDICATOR_CODES_BY_KEY[key] || []);
  if (codigos.size === 0) return [];
  return (Array.isArray(rows) ? rows : [])
    .filter((item) => item.raGeoId === raGeoId && item.pdadYear === year && codigos.has(item.indicatorCode));
}

/**
 * Valor escalar de uma RA para um item do Ranking dos territórios (issue #102):
 * `attr` lê um campo já pronto da RA (ex.: `incomePerCapita`, mesclado de
 * `RA_PROFILES` por quem monta `ras` — este módulo não conhece essa aba); os demais
 * leem a categoria declarada de um indicador. Ausência é sempre `null`, nunca `0`.
 */
export function rankScalar(ra, rankItem) {
  if (rankItem.attr) {
    const v = ra[rankItem.attr];
    return Number.isFinite(v) ? v : null;
  }
  const indicador = ra.indicators[rankItem.key];
  const achado = indicador?.values?.find((v) => v.label === rankItem.category);
  return achado && Number.isFinite(achado.pct) ? achado.pct : null;
}
