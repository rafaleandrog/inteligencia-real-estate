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
} from './indicators.js';

const AGE_INDICATOR_KEY = 'age';

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
    if (meta) accumulateIndicator(ra, item, meta);
  }

  const anos = {};
  for (const [ano, porRa] of porAno) {
    const ras = {};
    for (const [id, ra] of porRa) {
      finalizeAge(ra);
      const avgHouseholdSize = ra.households > 0 ? ra.population / ra.households : null;
      const indicadores = {};
      for (const [key, indicador] of ra.indicators) {
        indicadores[key] = {
          ...indicador,
          values: key === 'age' ? indicador.values : sortedValues(indicador.values),
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
