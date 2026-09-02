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
  }),
  ESTREITO: Object.freeze({
    nome: 'estreito', largura: 360, altura: 260, ticks: 3, maxRotulosX: 4, maxMarcadores: 14,
  }),
  SPARK: Object.freeze({
    nome: 'spark', largura: 120, altura: 32, ticks: 0, maxRotulosX: 0, maxMarcadores: 0,
  }),
});

/** Mesmo ponto de quebra dos cards (`assets/styles.css`, faixa de 560px). */
export function chartViewport(larguraDisponivelPx) {
  return Number(larguraDisponivelPx) <= 560 ? VIEWPORTS.ESTREITO : VIEWPORTS.PADRAO;
}

/** Largura mínima de uma coluna para ela ainda ser uma coluna, e não um fio. */
const LARGURA_MINIMA_COLUNA = 6;
const ALTURA_ROTULO_X = 16;
const LARGURA_MEDIA_CARACTERE = 6.2;

const arred = (n) => Math.round(n * 100) / 100;

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
      const largura = Math.max(1, (banda * 0.72) / model.series.length);
      const deslocamento = (banda - largura * model.series.length) / 2;
      return {
        chave: serie.chave,
        cat: serie.cat,
        tipo,
        segmentos: [],
        areas: [],
        marcadores: [],
        colunas: serie.pontos.flatMap((ponto, i) => {
          if (ponto.valor === null) return [];
          const topo = y(Math.max(ponto.valor, Math.max(model.y.min, 0)));
          const fundo = y(Math.min(ponto.valor, Math.max(model.y.min, 0)));
          return [{
            x: arred(xBanda(i) + deslocamento + largura * indiceSerie),
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
    };
  });

  const indices = semEixo ? [] : thinLabels(n, viewport.maxRotulosX);
  return {
    viewBox: `0 0 ${viewport.largura} ${viewport.altura}`,
    viewport: viewport.nome,
    tipo,
    plot,
    grade: marcasY.map((tick) => ({ y: y(tick.valor), rotulo: tick.rotulo })),
    eixoX: indices.map((i) => ({
      x: tipo === CHART_TYPES.COLUNAS ? arred(xBanda(i) + banda / 2) : xPonto(i),
      texto: model.categorias[i].rotulo,
      ancora: i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle'),
    })),
    eixoXBaseY: arred(plot.y + plot.altura + 12),
    zeroY: model.y.min < 0 && model.y.max > 0 ? y(0) : null,
    series,
  };
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
