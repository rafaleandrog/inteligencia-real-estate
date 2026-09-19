// Perfil imobiliário da RA — módulo puro (issue #126, Plano 01 §10).
//
// Deriva de `buildPdadIndex()` (src/pdad/aggregate.js) sete leituras de interesse
// imobiliário — verticalização, locação, escritura, população ocupada, até 30 min do
// trabalho, automóvel, internet própria — e as compara com uma REFERÊNCIA EXPLÍCITA: a
// mediana das RAs que publicaram o mesmo indicador, no mesmo ano. Nunca "média do DF":
// o DF tem uma média publicada pela PDAD, e a mediana entre RAs não é ela.
//
// O que este arquivo garante:
// - categoria suprimida ou ausente devolve `null` com o status, nunca 0 (R5.7);
// - ranking só existe entre RAs com valor PUBLICADO do mesmo indicador e ano;
// - "até 30 min" é a soma de duas faixas, e só quando as duas foram publicadas.

import { median } from '../filters.js';
import { rasForYear } from './aggregate.js';

/**
 * As sete leituras do perfil. `key` é a chave de exibição de `PDAD_INDICATORS`;
 * `categories` são os rótulos de `categoryLabel()` cujos percentuais se somam.
 */
export const RA_PROFILE_ITEMS = Object.freeze([
  { id: 'verticalizacao', label: 'Verticalização', key: 'dwelling', categories: ['Apartamento'], hint: '% dos domicílios em apartamento' },
  { id: 'locacao', label: 'Locação', key: 'tenure', categories: ['Alugado'], hint: '% dos domicílios alugados' },
  { id: 'escritura', label: 'Escritura registrada', key: 'deed', categories: ['Sim'], hint: '% dos imóveis próprios com escritura' },
  { id: 'ocupacao', label: 'População ocupada', key: 'peaSituation', categories: ['Ocupado'], hint: '% da população ocupada' },
  { id: 'ate30min', label: 'Até 30 min do trabalho', key: 'workTime', categories: ['Até 15 min', 'Mais de 15 até 30 minutos'], hint: '% dos trabalhadores até 30 min do trabalho' },
  { id: 'automovel', label: 'Automóvel', key: 'vehicles', categories: ['Automóvel'], hint: '% dos domicílios com automóvel' },
  { id: 'internet', label: 'Internet própria', key: 'internet', categories: ['Próprio'], hint: '% dos domicílios com internet própria' },
]);

export const PROFILE_STATUS = Object.freeze({
  PUBLISHED: 'published',
  SUPPRESSED: 'suppressed',
  MISSING: 'missing',
});

function raOf(index, year, raGeoId) {
  return index && index[year] ? index[year][raGeoId] || null : null;
}

/**
 * Lê (e soma) as categorias pedidas de um indicador da RA.
 *
 * @returns {{ value: number|null, status: string }} `published` quando todas as categorias
 *   têm percentual finito; `suppressed` quando alguma existe sem valor; `missing` quando o
 *   indicador ou a categoria não estão na RA.
 */
export function readCategories(ra, key, categories) {
  const indicador = ra && ra.indicators ? ra.indicators[key] : null;
  const valores = indicador && Array.isArray(indicador.values) ? indicador.values : null;
  if (!valores) return { value: null, status: PROFILE_STATUS.MISSING };
  let soma = 0;
  let suprimida = false;
  for (const categoria of categories) {
    const achado = valores.find((v) => v.label === categoria);
    if (!achado) return { value: null, status: PROFILE_STATUS.MISSING };
    if (!Number.isFinite(achado.pct)) { suprimida = true; continue; }
    soma += achado.pct;
  }
  if (suprimida) return { value: null, status: PROFILE_STATUS.SUPPRESSED };
  return { value: soma, status: PROFILE_STATUS.PUBLISHED };
}

/**
 * Referência explícita de um item: mediana entre as RAs do ano com valor PUBLICADO.
 * `n` diz sobre quantas RAs a mediana foi calculada — a tela sempre o mostra.
 */
export function referenceAcrossRas(index, year, item) {
  const publicadas = [];
  for (const ra of rasForYear(index, year)) {
    const leitura = readCategories(ra, item.key, item.categories);
    if (leitura.status === PROFILE_STATUS.PUBLISHED) publicadas.push({ raGeoId: ra.raGeoId, value: leitura.value });
  }
  return {
    median: median(publicadas.map((p) => p.value)),
    n: publicadas.length,
    values: publicadas,
  };
}

/** Diferença em pontos percentuais contra a referência; `null` sem qualquer um dos dois. */
export function deltaVsReference(value, referenceMedian) {
  if (!Number.isFinite(value) || !Number.isFinite(referenceMedian)) return null;
  return value - referenceMedian;
}

/**
 * Posição da RA entre as RAs com valor publicado (1 = maior). Empate compartilha a
 * posição. `null` quando a própria RA não publicou — sem valor não há lugar na fila.
 */
export function raRank(index, year, item, raGeoId) {
  const ref = referenceAcrossRas(index, year, item);
  const mine = ref.values.find((v) => v.raGeoId === raGeoId);
  if (!mine) return null;
  const acima = ref.values.filter((v) => v.value > mine.value).length;
  return { position: acima + 1, total: ref.n };
}

/**
 * Perfil imobiliário de uma RA num ano, cada item com valor, status, referência,
 * diferença em p.p. e posição. RA ausente do ano devolve `null`.
 */
export function raRealEstateProfile(index, year, raGeoId) {
  const ra = raOf(index, year, raGeoId);
  if (!ra) return null;
  return {
    raGeoId: ra.raGeoId,
    raName: ra.raName,
    year,
    items: RA_PROFILE_ITEMS.map((item) => {
      const leitura = readCategories(ra, item.key, item.categories);
      const ref = referenceAcrossRas(index, year, item);
      return {
        id: item.id,
        label: item.label,
        hint: item.hint,
        key: item.key,
        value: leitura.value,
        status: leitura.status,
        reference: { median: ref.median, n: ref.n },
        deltaPp: deltaVsReference(leitura.value, ref.median),
        rank: leitura.status === PROFILE_STATUS.PUBLISHED ? raRank(index, year, item, raGeoId) : null,
      };
    }),
  };
}

/**
 * Categoria dominante de uma série de categorias `{label, pct, status}`.
 *
 * @returns {{ leader, leaderPct, runnerUp, runnerUpPct, gapPp }|null} — `null` quando
 *   nenhuma categoria tem percentual; `runnerUp` `null` quando só há uma publicada.
 */
export function dominantCategory(series) {
  const publicadas = (Array.isArray(series) ? series : [])
    .filter((v) => v && Number.isFinite(v.pct))
    .sort((a, b) => b.pct - a.pct);
  if (publicadas.length === 0) return null;
  const [lider, segunda] = publicadas;
  return {
    leader: lider.label,
    leaderPct: lider.pct,
    runnerUp: segunda ? segunda.label : null,
    runnerUpPct: segunda ? segunda.pct : null,
    gapPp: segunda ? lider.pct - segunda.pct : null,
  };
}

/**
 * Lista compacta dos demais indicadores de uma RA (Plano 01 §10.5): rótulo, categoria
 * dominante e percentual — para virar a lista clicável que abre o detalhamento.
 * Indicadores em `excludeKeys` (os do perfil) e os de dois níveis (`shopping`) ficam fora.
 */
export function compactIndicators(index, year, raGeoId, excludeKeys = []) {
  const ra = raOf(index, year, raGeoId);
  if (!ra) return [];
  const excluir = new Set(excludeKeys);
  const out = [];
  for (const indicador of Object.values(ra.indicators || {})) {
    if (excluir.has(indicador.key) || !Array.isArray(indicador.values)) continue;
    const dominante = dominantCategory(indicador.values);
    out.push({
      key: indicador.key,
      label: indicador.label,
      unit: indicador.unit,
      leader: dominante ? dominante.leader : null,
      leaderPct: dominante ? dominante.leaderPct : null,
      gapPp: dominante ? dominante.gapPp : null,
    });
  }
  return out;
}
