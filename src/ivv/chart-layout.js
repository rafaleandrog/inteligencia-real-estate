// Geometria dos gráficos do Mercado Residencial DF — issue #83.
//
// Recebe um modelo de `chart-model.js` e devolve DADO PLANO: coordenadas, caminhos e
// retângulos prontos. Quem desenha (`src/app.js`) só percorre e cria nós — não calcula
// nada, não decide nada, e por isso a única parte não testável do gráfico virou o
// `createElementNS`.
//
// Espessura de traço, raio de marcador e opacidade NÃO estão aqui: são tema, moram no CSS.
// Cor muito menos — a série carrega o índice `cat` e o CSS resolve.

import { CHART_TYPES, thinLabels } from './chart-model.js';

/**
 * Três formatos, escolhidos pela largura disponível.
 *
 * O gráfico é SVG com `viewBox`, então ele já se estica sozinho; o que não se estica é a
 * densidade: oito rótulos de mês que cabem em 640 pontos viram uma tarja preta em 360.
 * Por isso a faixa estreita não é o mesmo desenho menor, é outro desenho.
 */
export const VIEWPORTS = Object.freeze({
  PADRAO: Object.freeze({
    nome: 'padrao', largura: 640, altura: 240, ticks: 4, maxRotulosX: 8, maxMarcadores: 24,
    larguraMin: 320, larguraMax: 1000,
  }),
  ESTREITO: Object.freeze({
    nome: 'estreito', largura: 360, altura: 260, ticks: 3, maxRotulosX: 4, maxMarcadores: 14,
    larguraMin: 220, larguraMax: 560,
  }),
  SPARK: Object.freeze({
    nome: 'spark', largura: 160, altura: 40, ticks: 0, maxRotulosX: 0, maxMarcadores: 0,
    larguraMin: 80, larguraMax: 480,
  }),
});

const limitar = (valor, min, max) => Math.min(Math.max(valor, min), max);

/**
 * Abaixo disto o gráfico não comporta oito rótulos de mês, e passa ao desenho estreito.
 *
 * O limiar é da CAIXA DO GRÁFICO, não da janela. Antes desta medida a entrada era a largura
 * da tela e o corte era o mesmo dos cards (560px); agora que o `viewBox` acompanha a caixa,
 * quem decide a densidade é o espaço que o desenho realmente tem. Um card de 498px num
 * desktop de 1440 é largo o bastante para os oito rótulos; a mesma tela em 390px dá ~338px
 * de card, onde oito rótulos viram tarja.
 */
const LARGURA_DO_DESENHO_ESTREITO = 420;

/**
 * O viewport de um gráfico: o PERFIL vem da largura da caixa, e a LARGURA também.
 *
 * A `largura` do perfil é só fallback. Quando ela é usada de verdade — um `viewBox` de 640
 * dentro de uma caixa de 498px —, o navegador escala tudo por 0,78 e a arte inteira encolhe
 * junto: rótulo de eixo de 10px chega na tela com 7,8px, traço de 2px com 1,56px. Ninguém
 * decidiu isso, e não há erro nenhum denunciando (R8.74). Medindo a caixa, 1 unidade do
 * `viewBox` vira 1 pixel e o desenho sai no tamanho em que foi pensado.
 *
 * A faixa `larguraMin`/`larguraMax` existe para o caso degenerado: container ainda sem
 * layout (mede 0) ou uma tela larguíssima em que o gráfico esticaria além do legível.
 */
export function chartViewport(larguraDoCardPx) {
  const perfil = Number(larguraDoCardPx) < LARGURA_DO_DESENHO_ESTREITO
    ? VIEWPORTS.ESTREITO : VIEWPORTS.PADRAO;
  return viewportComLargura(perfil, larguraDoCardPx);
}

/** O mesmo para o sparkline, que tem perfil próprio e não passa pelo ponto de quebra. */
export function sparkViewport(larguraDisponivelPx) {
  return viewportComLargura(VIEWPORTS.SPARK, larguraDisponivelPx);
}

function viewportComLargura(perfil, larguraPx) {
  const medida = Math.round(Number(larguraPx));
  if (!Number.isFinite(medida) || medida <= 0) return perfil;
  return { ...perfil, largura: limitar(medida, perfil.larguraMin, perfil.larguraMax) };
}

/** Largura mínima de uma coluna para ela ainda ser uma coluna, e não um fio. */
const LARGURA_MINIMA_COLUNA = 6;

/**
 * Teto de espessura da coluna, e o vão que separa vizinhas.
 *
 * Coluna que ocupa a banda inteira vira bloco: a marca engorda, o ar some e o gráfico fica
 * pesado sem ficar mais informativo. O teto deixa o resto da banda virar respiro. O que
 * separa duas colunas é um VÃO na cor do fundo, nunca um contorno desenhado em volta —
 * contorno é tinta que não é dado.
 */
const LARGURA_MAXIMA_COLUNA = 24;
const VAO_ENTRE_COLUNAS = 2;
const ALTURA_ROTULO_X = 16;
const LARGURA_MEDIA_CARACTERE = 6.2;

/** Respiro mínimo entre dois rótulos vizinhos do eixo X. */
const FOLGA_ENTRE_ROTULOS = 14;

const arred = (n) => Math.round(n * 100) / 100;

function maiorRotuloDeCategoria(model) {
  return model.categorias.reduce((maior, c) => Math.max(maior, larguraTexto(c.rotulo)), 0);
}

function larguraTexto(texto) {
  return String(texto || '').length * LARGURA_MEDIA_CARACTERE;
}

/**
 * A forma que o gráfico VAI ter, que nem sempre é a que ele pediu.
 *
 * Sessenta e seis colunas em 360 pontos dão menos de cinco pontos por coluna: o desenho
 * deixa de ser coluna e vira ruído listrado. Quando isso acontece a série degrada para
 * linha — decisão declarada aqui, com teste, e não um `if` improvisado no renderizador.
 */
export function tipoEfetivo(model, viewport) {
  if (model.tipo !== CHART_TYPES.COLUNAS) return model.tipo;
  const larguraUtil = viewport.largura * 0.8;
  const porColuna = larguraUtil / Math.max(1, model.categorias.length * model.series.length);
  return porColuna < LARGURA_MINIMA_COLUNA ? CHART_TYPES.LINHA : CHART_TYPES.COLUNAS;
}

export function chartGeometry(model, viewport = VIEWPORTS.PADRAO) {
  const tipo = tipoEfetivo(model, viewport);
  const semEixo = viewport.ticks === 0;
  const marcasY = semEixo ? [] : model.y.ticks;

  const esquerda = semEixo ? 0
    : 8 + Math.max(...marcasY.map((t) => larguraTexto(t.rotulo)), 0);
  const plot = {
    x: arred(esquerda),
    y: semEixo ? 2 : 8,
    largura: arred(viewport.largura - esquerda - (semEixo ? 0 : 12)),
    altura: arred(viewport.altura - (semEixo ? 4 : 8) - (semEixo ? 0 : ALTURA_ROTULO_X)),
  };

  const n = model.categorias.length;
  const dominio = model.y.max - model.y.min || 1;
  const y = (valor) => arred(plot.y + ((model.y.max - valor) / dominio) * plot.altura);
  const banda = n === 0 ? plot.largura : plot.largura / n;
  const xPonto = (i) => arred(n === 1
    ? plot.x + plot.largura / 2
    : plot.x + (i / (n - 1)) * plot.largura);
  const xBanda = (i) => plot.x + banda * i;

  const base = y(Math.max(model.y.min, 0));
  const marcadoresVisiveis = n > 0 && n <= viewport.maxMarcadores;

  const series = model.series.map((serie, indiceSerie) => {
    if (tipo === CHART_TYPES.COLUNAS) {
      const nSeries = model.series.length;
      const disponivel = (banda * 0.8) - VAO_ENTRE_COLUNAS * (nSeries - 1);
      const largura = Math.max(1, Math.min(disponivel / nSeries, LARGURA_MAXIMA_COLUNA));
      const passo = largura + VAO_ENTRE_COLUNAS;
      const grupo = largura * nSeries + VAO_ENTRE_COLUNAS * (nSeries - 1);
      const deslocamento = (banda - grupo) / 2;
      return {
        chave: serie.chave,
        cat: serie.cat,
        tipo,
        segmentos: [],
        areas: [],
        marcadores: [],
        ultimoPonto: null,
        colunas: serie.pontos.flatMap((ponto, i) => {
          if (ponto.valor === null) return [];
          const topo = y(Math.max(ponto.valor, Math.max(model.y.min, 0)));
          const fundo = y(Math.min(ponto.valor, Math.max(model.y.min, 0)));
          return [{
            x: arred(xBanda(i) + deslocamento + passo * indiceSerie),
            y: topo,
            largura: arred(largura),
            altura: arred(Math.max(1, fundo - topo)),
            titulo: ponto.titulo,
          }];
        }),
      };
    }

    // Linha e área: cada trecho contínuo vira um caminho. O buraco de um mês sem dado
    // INTERROMPE o traço — ligar os dois lados inventaria uma reta que o dado não tem.
    const trechos = [];
    let atual = [];
    for (const ponto of serie.pontos) {
      if (ponto.valor === null) {
        if (atual.length) trechos.push(atual);
        atual = [];
        continue;
      }
      atual.push({ x: xPonto(ponto.i), y: y(ponto.valor), titulo: ponto.titulo });
    }
    if (atual.length) trechos.push(atual);

    return {
      chave: serie.chave,
      cat: serie.cat,
      tipo,
      segmentos: trechos.map((t) => caminho(t, plot)),
      areas: tipo === CHART_TYPES.AREA
        ? trechos.map((t) => `${caminho(t, plot)}L${t.at(-1).x},${base}L${t[0].x},${base}Z`)
        : [],
      colunas: [],
      marcadores: marcadoresVisiveis
        ? trechos.flat().map((p) => ({ cx: p.x, cy: p.y, titulo: p.titulo }))
        : [],
      ultimoPonto: ultimoPontoDe(serie, xPonto, y),
    };
  });

  // Quantos rótulos cabem é conta de ESPAÇO, não número fixo do perfil: dois gráficos da
  // mesma largura têm plots diferentes quando um deles tem rótulo de eixo Y mais longo
  // ("R$ 14.000/m²" contra "5,0%"). Com o teto fixo, o mais apertado dos dois colava
  // "jan./2025" em "mar./2025". O teto do perfil vira limite superior, não a resposta.
  const cabeNoEixo = Math.floor(plot.largura / (maiorRotuloDeCategoria(model) + FOLGA_ENTRE_ROTULOS));
  const indices = semEixo ? []
    : thinLabels(n, Math.max(2, Math.min(viewport.maxRotulosX, cabeNoEixo)));
  const centroDaCategoria = (i) => (tipo === CHART_TYPES.COLUNAS
    ? arred(xBanda(i) + banda / 2)
    : xPonto(i));

  return {
    viewBox: `0 0 ${viewport.largura} ${viewport.altura}`,
    viewport: viewport.nome,
    largura: viewport.largura,
    altura: viewport.altura,
    tipo,
    plot,
    // Onde cada categoria cai no eixo X. O crosshair precisa disso para achar o mês mais
    // próximo do ponteiro; sem publicar aqui, o renderizador teria de refazer a conta — e
    // duas contas da mesma coisa divergem no primeiro ajuste.
    categoriasX: Array.from({ length: n }, (_, i) => centroDaCategoria(i)),
    grade: marcasY.map((tick) => ({ y: y(tick.valor), rotulo: tick.rotulo })),
    eixoX: indices.map((i) => ({
      x: centroDaCategoria(i),
      texto: model.categorias[i].rotulo,
      ancora: i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle'),
    })),
    eixoXBaseY: arred(plot.y + plot.altura + 12),
    zeroY: model.y.min < 0 && model.y.max > 0 ? y(0) : null,
    series,
  };
}

/**
 * O último ponto COM VALOR da série — âncora do rótulo direto e do ponto final.
 *
 * É o último com valor, não o último do eixo: uma série que termina em buraco tem o rótulo
 * pendurado no mês em que ela realmente acaba, e não flutuando no vazio.
 */
function ultimoPontoDe(serie, xPonto, y) {
  for (let i = serie.pontos.length - 1; i >= 0; i -= 1) {
    const ponto = serie.pontos[i];
    if (ponto.valor === null) continue;
    return { cx: xPonto(ponto.i), cy: y(ponto.valor), rotulo: ponto.rotulo, titulo: ponto.titulo };
  }
  return null;
}

function caminho(pontos, plot) {
  if (pontos.length === 1) {
    // Um ponto só não desenha reta: vira um traço curtíssimo, para a série não sumir —
    // preso dentro da área de plotagem, para não invadir a coluna dos rótulos do eixo Y.
    const { x, y } = pontos[0];
    const inicio = Math.max(plot.x, x - 1);
    const fim = Math.min(plot.x + plot.largura, x + 1);
    return `M${inicio},${y}L${fim},${y}`;
  }
  return pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('');
}
