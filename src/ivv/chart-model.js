// Modelo semântico de um gráfico do Mercado Residencial DF — issue #83.
//
// Este módulo decide SIGNIFICADO: quais categorias existem, que valor cada série tem em
// cada uma, como esse valor se lê em português, que marcas o eixo Y merece e o que dizer
// quando o dado não existe. Ele não conhece pixel, não conhece cor e não toca no DOM.
//
// A separação com `chart-layout.js` (que só faz geometria) existe porque as duas decisões
// envelhecem em ritmos diferentes: mudar de 4 para 5 marcas no eixo é estética, mudar o
// que "sem valor publicado" significa é metodologia. Misturadas, a segunda passa a ser
// alterada por engano ao mexer na primeira.
//
// Cor NÃO mora aqui. A série declara `cat: 3` — um ÍNDICE na paleta categórica —, e quem
// resolve o índice em cor é o CSS. Antes desta issue, `history.js` cravava `#55d99a` e
// companhia: um módulo puro decidindo aparência, sem enxergar o tema escuro e sem nenhum
// teste capaz de alcançar a decisão.

/** Formas de desenho suportadas. Vocabulário fechado: `chart-layout.js` conhece as três. */
export const CHART_TYPES = Object.freeze({
  LINHA: 'linha',
  AREA: 'area',
  COLUNAS: 'colunas',
});

/**
 * De qual recorte de linhas o gráfico lê.
 *
 * É declaração, não busca: nenhum módulo puro conhece o estado da aplicação. Quem monta
 * os três conjuntos é a camada de tela, e cada definição diz de qual deles se serve — que
 * é como a sazonalidade enxerga anos inteiros enquanto os demais ficam na janela do filtro.
 */
export const CHART_SOURCES = Object.freeze({
  PERIODO: 'periodo',
  JANELA: 'janela',
  COMPLETA: 'completa',
});

const AUSENTE = 'sem valor publicado';

/** Uma frase, não um traço: travessão num gráfico é indistinguível de zero mal desenhado. */
export const MENSAGEM_SEM_DADO = 'Sem valores mensais para este período.';

const PASSOS = Object.freeze([1, 2, 2.5, 5, 10]);

/**
 * Marcas "redondas" para o eixo Y, no espírito do algoritmo de eixo de qualquer biblioteca
 * séria: escolhe-se um passo da forma 1/2/2,5/5 × 10ⁿ e marcam-se os múltiplos dele dentro
 * do domínio. Sem isso o eixo vira `1.234,56`, `2.469,12`, ... — números exatos, ilegíveis
 * e que ninguém compara de cabeça.
 */
export function niceTicks(min, max, alvo = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || alvo < 2) return [];
  if (min === max) return [min];
  const bruto = (max - min) / (alvo - 1);
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const passo = (PASSOS.find((p) => p * magnitude >= bruto) || 10) * magnitude;
  const marcas = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + passo * 1e-9; v += passo) {
    // O acumulador de ponto flutuante produz 0.30000000000000004; arredondar na casa do
    // passo devolve o número que a pessoa esperava ver.
    marcas.push(Number(v.toFixed(Math.max(0, -Math.floor(Math.log10(passo)) + 2))));
  }
  return marcas;
}

/**
 * Quais rótulos do eixo X desenhar quando eles não cabem todos.
 *
 * Desenha-se 1 a cada k, e o PRIMEIRO e o ÚLTIMO entram sempre — são eles que dizem onde a
 * série começa e termina, que é a pergunta que alguém faz olhando o eixo.
 */
export function thinLabels(total, maxRotulos) {
  if (total <= 0 || maxRotulos <= 0) return [];
  if (total <= maxRotulos) return [...Array(total).keys()];
  const passo = Math.ceil((total - 1) / (maxRotulos - 1));
  const indices = [];
  for (let i = 0; i < total; i += passo) indices.push(i);
  if (indices.at(-1) !== total - 1) {
    // O último rótulo entra sempre — mas se ele cair colado no anterior, SUBSTITUI aquele
    // em vez de se somar a ele. Empurrar os dois para o mesmo lugar não é rótulo a mais:
    // é "nov./2025dez./2025" ilegível na ponta do eixo, que foi o que apareceu na tela.
    if (total - 1 - indices.at(-1) < passo) indices[indices.length - 1] = total - 1;
    else indices.push(total - 1);
  }
  return indices;
}

function extremos(series, baseZero) {
  const valores = series.flatMap((s) => s.pontos.map((p) => p.valor)).filter(Number.isFinite);
  if (valores.length === 0) return { min: 0, max: 1 };
  let min = baseZero ? Math.min(0, ...valores) : Math.min(...valores);
  let max = Math.max(...valores);
  if (min === max) {
    const folga = Math.abs(max || 1) * 0.1;
    max += folga;
    if (!baseZero) min -= folga;
  } else if (!baseZero) {
    const folga = (max - min) * 0.08;
    min -= folga;
    max += folga;
  }
  return { min, max };
}

/**
 * Monta o modelo do gráfico.
 *
 * @param definicao `{ key, titulo, tipo, baseZero, formatar, rotuloCategoria, ticks }`
 *   — `formatar(valor)` devolve o texto pt-BR do valor (é quem conhece a unidade da
 *   métrica), `rotuloCategoria(chave)` devolve o texto do eixo X.
 * @param series `[{ chave, rotulo, cat, pontos: [{ categoria, valor }] }]` — valor `null`
 *   é ausência declarada e PRESERVA a categoria: o buraco fica visível no lugar certo,
 *   em vez de a série encolher e mentir sobre o eixo (R5.7).
 */
export function buildChartModel(definicao, series) {
  const {
    key, titulo, tipo = CHART_TYPES.LINHA, baseZero = true,
    formatar = (v) => String(v), rotuloCategoria = (c) => c, ticks = 4,
  } = definicao || {};

  const normalizadas = (series || []).map((serie) => ({
    chave: serie.chave,
    rotulo: serie.rotulo || serie.chave,
    cat: serie.cat,
    pontos: (serie.pontos || []).map((ponto) => ({
      categoria: ponto.categoria,
      valor: Number.isFinite(ponto.valor) ? ponto.valor : null,
    })),
  }));

  const categorias = [...new Set(normalizadas.flatMap((s) => s.pontos.map((p) => p.categoria)))]
    .sort()
    .map((chave) => ({ chave, rotulo: rotuloCategoria(chave) }));
  const vazio = normalizadas.every((s) => s.pontos.every((p) => p.valor === null));
  const { min, max } = extremos(normalizadas, baseZero);

  const seriesModelo = normalizadas.map((serie) => {
    const porCategoria = new Map(serie.pontos.map((p) => [p.categoria, p.valor]));
    return {
      chave: serie.chave,
      rotulo: serie.rotulo,
      cat: serie.cat,
      pontos: categorias.map((categoria, i) => {
        const valor = porCategoria.has(categoria.chave) ? porCategoria.get(categoria.chave) : null;
        const texto = valor === null ? null : formatar(valor);
        return {
          i,
          categoria: categoria.chave,
          valor,
          rotulo: texto,
          titulo: `${serie.rotulo} · ${categoria.rotulo}: ${texto === null ? AUSENTE : texto}`,
        };
      }),
    };
  });

  const modelo = {
    key,
    titulo,
    tipo,
    categorias,
    series: seriesModelo,
    y: {
      min,
      max,
      baseZero,
      ticks: niceTicks(min, max, ticks).map((valor) => ({ valor, rotulo: formatar(valor) })),
    },
    vazio: vazio || categorias.length === 0,
    mensagemVazio: MENSAGEM_SEM_DADO,
    ariaLabel: ariaLabel(titulo, seriesModelo, categorias),
  };
  modelo.tabela = chartTable(modelo);
  return modelo;
}

function ariaLabel(titulo, series, categorias) {
  if (categorias.length === 0) return `${titulo}: ${MENSAGEM_SEM_DADO}`;
  const trecho = series.length === 1
    ? series[0].rotulo
    : `${series.length} séries (${series.map((s) => s.rotulo).join(', ')})`;
  const inicio = categorias[0].rotulo;
  const fim = categorias.at(-1).rotulo;
  return inicio === fim
    ? `${titulo}: ${trecho} em ${inicio}.`
    : `${titulo}: ${trecho}, de ${inicio} a ${fim}.`;
}

/**
 * Os mesmos números em tabela, para quem lê por leitor de tela e para quem quer conferir o
 * valor exato de um mês — que o gráfico só entrega no `title` do marcador, e nem sempre há
 * marcador. Ausência vira frase, como no resto da tela.
 */
export function chartTable(model) {
  return {
    colunas: ['Mês', ...model.series.map((s) => s.rotulo)],
    linhas: model.categorias.map((categoria, i) => [
      categoria.rotulo,
      ...model.series.map((serie) => serie.pontos[i].rotulo ?? AUSENTE),
    ]),
  };
}
