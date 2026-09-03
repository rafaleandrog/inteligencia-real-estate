// Preço FipeZap por Região Administrativa — `FIPEZAP_LOCALITY_MONTHLY`.
//
// Diferente do `IVV_REGION` (retrato de um mês só), esta aba é SÉRIE — cada localidade
// tem vários anos de venda e locação lado a lado, que é o corte que permite perguntar
// "como o preço desta região evoluiu?", não só "quem está mais caro agora?".
//
// Comparação é entre localidades, uma de cada vez: o seletor troca a localidade ativa, e a
// tela mostra os dois gráficos (venda, locação) da região escolhida. Dois gráficos, não um
// com duas séries: venda (R$/m²) e locação (R$/m²/mês) são ordens de grandeza diferentes, e
// dividir eixo Y achataria a locação — ver `buildLocalityCharts` abaixo.

import { buildChartModel, CHART_TYPES } from '../ivv/chart-model.js';
import { formatPriceM2, compactNumber, formatPercent, percentFromDecimal } from '../format.js';
import { monthYearLabel } from '../ivv/period.js';

export const FIPEZAP_SEGMENTS = Object.freeze([
  { value: 'RESIDENCIAL', label: 'Residencial' },
  { value: 'COMERCIAL', label: 'Comercial' },
]);

/**
 * "ASA SUL" -> "Asa Sul". Sem restaurar acento que a fonte não tem — simplificação
 * honesta, nunca palpite de grafia (ex.: "AGUAS CLARAS" vira "Aguas Claras", não
 * "Águas Claras": essa forma vem de `ra_name`, que É a fonte confiável para ela).
 */
export function formatLocalityDisplayName(nome) {
  return String(nome || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

/**
 * Localidades com pelo menos um mês publicado no segmento escolhido, para popular o
 * seletor — nunca uma lista fixa: um segmento que ainda não tem nenhuma localidade
 * publicada mostra o seletor vazio em vez de opções que não levam a lugar nenhum.
 *
 * `FIPEZAP_LOCALITY_MONTHLY` mistura dois níveis geográficos na mesma coluna
 * `source_locality_name`: Região Administrativa inteira (`geography_classification =
 * RA_OU_LOCALIDADE_FIPE`, ex. Gama, Lago Sul) e submercado DENTRO de uma RA
 * (`SUBMERCADO_FIPE`, ex. Asa Sul e Asa Norte são os dois dentro do Plano Piloto).
 * Sete `ra_name` cobrem 18 das 29 localidades — sem marcar isso, o seletor mostraria
 * "Plano Piloto" repetido quatro vezes, indistinguível. `ambiguous` sinaliza quando
 * `raName` sozinho não identifica a linha; quem monta a tela usa isso para agrupar por
 * RA e rotular pelo nome do submercado, não pelo nome da RA repetido.
 */
export function localitiesAvailable(rows, segmentScope) {
  const porLocalidade = new Map();
  for (const row of rows || []) {
    if (row.segment_scope !== segmentScope || !row.source_locality_name) continue;
    if (!porLocalidade.has(row.source_locality_name)) {
      porLocalidade.set(row.source_locality_name, row.ra_name || row.source_locality_name);
    }
  }
  const porRaName = new Map();
  for (const raName of porLocalidade.values()) porRaName.set(raName, (porRaName.get(raName) || 0) + 1);

  return [...porLocalidade.entries()]
    .map(([locality, raName]) => ({
      locality,
      raName,
      ambiguous: porRaName.get(raName) > 1,
      displayName: formatLocalityDisplayName(locality),
    }))
    .sort((a, b) => (
      a.raName.localeCompare(b.raName, 'pt-BR') || a.displayName.localeCompare(b.displayName, 'pt-BR')
    ));
}

const FORMATO_PRECO = Object.freeze({
  formatar: (valor) => formatPriceM2(valor),
  formatarCurto: (valor) => `R$ ${compactNumber(valor)}/m²`,
});

/** `-0.1017` -> "−10,2%". Sinal explícito: "10,2%" sozinho não diz acima ou abaixo do DF. */
function formatDiff(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const texto = formatPercent(percentFromDecimal(Math.abs(value)));
  return value < 0 ? `−${texto}` : `+${texto}`;
}

function graficoDaLocalidade(rows, {
  locality, segmentScope, valueKey, diffKey, titulo, serieRotulo, pergunta, cat,
}) {
  const doRecorte = (rows || [])
    .filter((row) => row.source_locality_name === locality && row.segment_scope === segmentScope);

  const modelo = buildChartModel(
    {
      key: `fipezap-localidade-${valueKey}`,
      titulo,
      tipo: CHART_TYPES.LINHA,
      baseZero: false,
      rotuloCategoria: monthYearLabel,
      ...FORMATO_PRECO,
    },
    [{
      chave: valueKey,
      // Rótulo curto na legenda: o título do card já diz "venda em Águas Claras" — repetir
      // a frase inteira ao lado do traço é ruído que a legenda do IVV também não tem.
      rotulo: serieRotulo,
      cat,
      pontos: doRecorte.map((row) => ({
        categoria: row.reference_date.slice(0, 7),
        valor: row[valueKey] ?? null,
      })),
    }],
  );

  // `diff_vs_df_pct` é do MESMO mês do ponto mais recente, nunca recalculado aqui — é o
  // FipeZap comparando a própria localidade contra o próprio DF_TOTAL no mesmo corte
  // (mesma disciplina de "publicado vence recalculado" que o resto do projeto já segue).
  const ultimo = doRecorte.at(-1);
  const diffBruto = ultimo ? ultimo[diffKey] : null;
  const diffValor = formatDiff(diffBruto);
  const resumo = diffValor
    ? {
      valor: diffValor,
      rotulo: `${diffBruto < 0 ? 'abaixo' : 'acima'} da média do DF em `
        + `${monthYearLabel(ultimo.reference_date.slice(0, 7))}`,
    }
    : null;

  return { ...modelo, pergunta, resumo };
}

/**
 * Os dois gráficos de uma localidade: venda e locação, série inteira (sem filtro de
 * período — o valor aqui é "como esta região evoluiu", cortar a janela esconderia
 * justamente o que se veio ver). Dois gráficos de uma série, não um de duas: venda
 * (R$/m²) e locação (R$/m²/mês) são ordens de grandeza diferentes, e um eixo Y só para
 * as duas achataria a locação numa linha reta perto do zero (mesma disciplina de
 * `src/fipezap/history.js` para o comercial do DF).
 */
export function buildLocalityCharts(rows, { locality, segmentScope }) {
  const nome = locality ? formatLocalityDisplayName(locality) : 'localidade selecionada';
  return [
    graficoDaLocalidade(rows, {
      locality, segmentScope, valueKey: 'sale_price_brl_m2', diffKey: 'sale_diff_vs_df_pct', cat: 1,
      titulo: `Venda em ${nome} (R$/m²)`, serieRotulo: 'Venda',
      pergunta: 'Como o preço de venda evoluiu nesta região?',
    }),
    graficoDaLocalidade(rows, {
      locality, segmentScope, valueKey: 'rent_price_brl_m2_month', diffKey: 'rent_diff_vs_df_pct', cat: 2,
      titulo: `Locação em ${nome} (R$/m²/mês)`, serieRotulo: 'Locação',
      pergunta: 'E o aluguel, como andou nesta região?',
    }),
  ];
}
