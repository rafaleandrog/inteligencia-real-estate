// Cobertura de observação de tráfego — funções puras.
//
// DECISÃO — por que `cobertura_dia_pct` do backend é ignorado por completo:
//
//   O backend grava `cobertura_dia_pct` com um bug de locale/separador decimal
//   em 9 dos 100 registros de TRAFFIC_DAILY_TEST. Exemplo real de um dia parcial:
//
//       intervalos_15min_observados = 90
//       cobertura_dia_pct           = 9375     ← deveria ser 0,9375 (93,75%)
//
//   Nos 91 dias completos o campo está certo (intervalos = 96, cobertura = 1),
//   o que o torna o pior tipo de coluna: passa em qualquer revisão superficial
//   porque "funciona" na maioria dos registros, e só denuncia o bug quando se
//   confere um dia parcial especificamente. `intervalos_15min_observados` é a
//   contagem bruta — sem locale, sem formatação — e é confiável nos 100
//   registros. Por isso a cobertura é sempre derivada dele
//   (`intervalos_15min_observados / 96`), nunca lida de `cobertura_dia_pct`.
//
//   Se o backend corrigir o bug de locale, a troca é de uma linha — mas só
//   depois de o dado corrigido ser conferido registro a registro, não por
//   confiança. Ver R8.58 em docs/ENGINEERING_RULES.md.
//
// Segundo risco, independente do bug acima: um intervalo de 15 min sem
// observação NÃO significa tráfego zero — significa que ninguém mediu.
// Nenhuma função aqui preenche intervalo ausente com zero; um dia parcial
// carrega sua cobertura real e nunca é somado como se fosse um dia completo
// silenciosamente completado.

/** Total de intervalos de 15 min possíveis num dia (24h × 4). */
export const INTERVALS_PER_DAY = 96;

/**
 * Cobertura real do dia, derivada de `intervalos_15min_observados`.
 * Ignora `cobertura_dia_pct` — ver nota de topo do arquivo.
 * @param {number} intervalsObserved
 * @returns {number|null} fração entre 0 e 1, ou null se o valor for inválido
 */
export function dailyCoverage(intervalsObserved) {
  if (!Number.isFinite(intervalsObserved) || intervalsObserved < 0) return null;
  return Math.min(intervalsObserved, INTERVALS_PER_DAY) / INTERVALS_PER_DAY;
}

/**
 * Classifica um dia de tráfego como completo ou parcial, a partir da
 * contagem bruta de intervalos observados. Nunca lê `cobertura_dia_pct`.
 * @param {number} intervalsObserved
 * @returns {{status: 'complete'|'partial'|'unknown', coverage: number|null, intervalsObserved: number|null, qualityFlag: string|null}}
 */
export function classifyDayCoverage(intervalsObserved) {
  const coverage = dailyCoverage(intervalsObserved);
  if (coverage === null) {
    return { status: 'unknown', coverage: null, intervalsObserved: null, qualityFlag: 'no_coverage_data' };
  }
  const observed = Math.min(intervalsObserved, INTERVALS_PER_DAY);
  if (observed >= INTERVALS_PER_DAY) {
    return { status: 'complete', coverage, intervalsObserved: observed, qualityFlag: null };
  }
  return { status: 'partial', coverage, intervalsObserved: observed, qualityFlag: 'partial_intervals' };
}

/**
 * Média de fluxo (ex.: veículos/dia) sobre uma lista de dias, declarando
 * explicitamente sobre quantos dias foi calculada e quantos eram parciais.
 * Nunca preenche intervalo ausente com zero: um dia sem `flow` numérico é
 * excluído da média, não tratado como fluxo zero.
 *
 * VIÉS DELIBERADO — leia antes de "consertar":
 *
 *   Isto é `sum(flow) / count(dias)`, a média aritmética simples dos totais diários.
 *   Um dia parcial (ex.: 90/96 intervalos, ~93,75% do tempo observado) tem um total
 *   naturalmente menor que um dia completo pelo simples fato de ter sido medido por
 *   menos tempo — não porque teve menos tráfego. Entrar na média sem ajuste **enviesa
 *   o resultado para baixo**, e o viés cresce com a proporção de dias parciais no
 *   conjunto (`partialDaysUsed / daysUsed`).
 *
 *   A correção óbvia — dividir cada total pela cobertura do dia antes de somar, para
 *   "escalar" um dia parcial ao que ele teria sido num dia inteiro — NÃO é feita
 *   aqui, de propósito: isso estimaria o tráfego não observado, ou seja, inventaria
 *   dado. A issue #64 proíbe exatamente isso ("nunca preencha intervalo ausente").
 *   Entre um número levemente enviesado e um número parcialmente inventado, fica o
 *   enviesado — mas declarado.
 *
 *   Isto também mantém paridade deliberada com `trafficSummaryByCode_()` no `Code.gs`
 *   do backend, que calcula `avgDailyFlow = sum / rows` da mesma forma, sem ajuste de
 *   cobertura. Divergir em silêncio seria pior que o viés: o painel mostraria um
 *   número diferente do que a própria planilha reporta para o mesmo trecho. A decisão
 *   é acompanhar o backend e declarar a limitação, não corrigir por conta própria.
 *
 *   `partialDaysUsed` no retorno é o sinal de alerta: quem consome este número (ex.:
 *   um gráfico) deve mostrá-lo junto, para que "média enviesada para baixo" não vire
 *   "média" sem qualificação nenhuma.
 *
 * @param {Array<{flow: number, intervalsObserved: number}>} days
 * @returns {{average: number|null, daysUsed: number, partialDaysUsed: number, daysExcluded: number, completeDaysAverage: number|null}}
 */
export function averageFlow(days) {
  if (!Array.isArray(days) || days.length === 0) {
    return {
      average: null, daysUsed: 0, partialDaysUsed: 0, daysExcluded: 0, completeDaysAverage: null,
    };
  }

  let sum = 0;
  let daysUsed = 0;
  let partialDaysUsed = 0;
  let daysExcluded = 0;
  let completeSum = 0;
  let completeDaysUsed = 0;

  for (const day of days) {
    const flow = day && day.flow;
    if (!Number.isFinite(flow)) {
      daysExcluded += 1;
      continue;
    }
    const classified = classifyDayCoverage(day.intervalsObserved);
    if (classified.status === 'unknown') {
      daysExcluded += 1;
      continue;
    }
    sum += flow;
    daysUsed += 1;
    if (classified.status === 'partial') {
      partialDaysUsed += 1;
    } else {
      completeSum += flow;
      completeDaysUsed += 1;
    }
  }

  return {
    average: daysUsed > 0 ? sum / daysUsed : null,
    daysUsed,
    partialDaysUsed,
    daysExcluded,
    // Valor adicional, só sobre dias completos — sem viés de cobertura, mas sobre uma
    // amostra menor. Não substitui `average` (que segue a paridade com o backend);
    // existe para quem precisar de um número sem o viés descrito acima.
    completeDaysAverage: completeDaysUsed > 0 ? completeSum / completeDaysUsed : null,
  };
}
