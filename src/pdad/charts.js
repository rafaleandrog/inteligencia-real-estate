// Desenho dos gráficos da tela Diagnóstico Territorial (issue #102).
//
// Funções puras de DOM/SVG — recebem os valores já agregados por
// `src/pdad/aggregate.js` e devolvem um nó pronto para anexar, sem estado próprio e
// sem ler `state`. Nenhuma string de dado vai para `innerHTML`: tudo por
// `createElement`/`createElementNS` + `textContent`, mesma regra do resto do
// `src/app.js` (docs/ENGINEERING_RULES.md R4.4).
//
// Categoria suprimida/parcial nunca vira barra de tamanho zero — sai com o status
// preservado, e quem olha vê "suprimido"/"parcial", nunca "0%" (R5.7).
//
// Elemento clicável leva `data-drill-category` (e, quando aplicável,
// `data-drill-group`) — não um `onClick` por chamada — para que `src/app.js` escute
// por delegação no container, do mesmo jeito que já faz com `.market-chip`.

import { formatPercent, percentFromPoints } from '../format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Paleta categórica do site, pela MESMA regra das demais telas: consumida por índice. */
const SERIES = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)'];

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function pctText(pct) {
  return Number.isFinite(pct) ? formatPercent(percentFromPoints(pct)) : null;
}

/** Frase de ausência — nunca "0%". */
function absentText(status) {
  if (status === 'suppressed') return 'suprimido';
  if (status === 'partial') return 'parcial';
  return '—';
}

function emptyNote(texto) {
  const p = document.createElement('p');
  p.className = 'pdad-empty';
  p.textContent = texto;
  return p;
}

function moreNote(resto) {
  const p = document.createElement('p');
  p.className = 'pdad-bar-mais';
  p.textContent = `+${resto} categoria(s) não mostrada(s) neste recorte.`;
  return p;
}

function barRow(valor, maximo) {
  const li = document.createElement('li');
  li.className = 'pdad-bar';
  li.dataset.drillCategory = valor.label;

  const nome = document.createElement('span');
  nome.className = 'pdad-bar-nome';
  nome.title = valor.label;
  nome.textContent = valor.label;

  const trilho = document.createElement('span');
  trilho.className = 'pdad-bar-trilho';
  const fill = document.createElement('span');
  fill.className = 'pdad-bar-fill';
  const pct = Number.isFinite(valor.pct) ? valor.pct : null;
  fill.style.width = (pct !== null && maximo > 0) ? `${Math.max(2, (pct / maximo) * 100)}%` : '0%';
  trilho.append(fill);

  const numero = document.createElement('span');
  const ausente = pct === null;
  numero.className = ausente ? 'pdad-bar-valor pdad-ausente' : 'pdad-bar-valor';
  numero.textContent = ausente ? absentText(valor.status) : pctText(pct);

  li.append(nome, trilho, numero);
  return li;
}

/** Barras horizontais — o gráfico padrão, usado pela maioria dos indicadores. */
export function buildHbars(values, { cap = 8 } = {}) {
  if (!values.length) return emptyNote('Sem valores publicados para esta seleção.');
  const mostrados = values.slice(0, cap);
  const resto = values.length - mostrados.length;
  const maximo = Math.max(...mostrados.map((v) => (Number.isFinite(v.pct) ? v.pct : 0)), 1);

  const lista = document.createElement('ul');
  lista.className = 'pdad-bar-list';
  for (const valor of mostrados) lista.append(barRow(valor, maximo));

  const frag = document.createDocumentFragment();
  frag.append(lista);
  if (resto > 0) frag.append(moreNote(resto));
  return frag;
}

/** Colunas verticais com rótulo de valor — usado por `age` (as 5 faixas etárias fixas). */
export function buildColumns(values) {
  if (!values.length) return emptyNote('Sem valores publicados para esta seleção.');
  const W = 460; const H = 160; const mg = { l: 6, r: 6, t: 22, b: 22 };
  const iw = W - mg.l - mg.r; const ih = H - mg.t - mg.b;
  const max = Math.max(...values.map((v) => (Number.isFinite(v.pct) ? v.pct : 0)), 1);
  const n = values.length; const band = iw / n;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pdad-cols-svg', role: 'img' });
  const eixo = svgEl('line', {
    class: 'pdad-sc-axis', x1: mg.l, x2: W - mg.r, y1: mg.t + ih, y2: mg.t + ih,
  });
  svg.append(eixo);

  values.forEach((valor, i) => {
    const pct = Number.isFinite(valor.pct) ? valor.pct : 0;
    const bw = Math.min(36, band * 0.42);
    const x = mg.l + band * i + (band - bw) / 2;
    const h = Math.max(2, (pct / max) * ih);
    const y = mg.t + ih - h;

    const g = svgEl('g', { class: 'pdad-col-g' });
    g.dataset.drillCategory = valor.label;
    const hit = svgEl('rect', {
      x: mg.l + band * i + band * 0.06, y: mg.t, width: band * 0.88, height: ih, fill: 'transparent',
    });
    const barra = svgEl('rect', { x, y, width: bw, height: h, rx: 3, fill: 'var(--cat-2)' });
    const valorTxt = svgEl('text', { class: 'pdad-col-val', x: x + bw / 2, y: y - 8, 'text-anchor': 'middle' });
    valorTxt.textContent = Number.isFinite(valor.pct) ? pctText(valor.pct) : absentText(valor.status);
    const catTxt = svgEl('text', { class: 'pdad-col-cat', x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' });
    catTxt.textContent = valor.label;

    g.append(hit, barra, valorTxt, catTxt);
    svg.append(g);
  });

  return svg;
}

function circleSegments(values, { radius, strokeWidth, gap }) {
  const total = values.reduce((soma, v) => soma + (Number.isFinite(v.pct) ? v.pct : 0), 0) || 1;
  const circunferencia = 2 * Math.PI * radius;
  let offset = 0;
  return values.map((valor, i) => {
    const comprimento = ((Number.isFinite(valor.pct) ? valor.pct : 0) / total) * circunferencia;
    const dash = Math.max(0.5, comprimento - gap);
    const circulo = svgEl('circle', {
      r: radius, cx: 75, cy: 75, fill: 'none', stroke: SERIES[i % SERIES.length], 'stroke-width': strokeWidth,
      'stroke-dasharray': `${dash} ${circunferencia - dash}`, 'stroke-dashoffset': -offset,
      class: 'pdad-donut-seg',
    });
    circulo.dataset.drillCategory = valor.label;
    offset += comprimento;
    return circulo;
  });
}

function donutLegend(values) {
  const legenda = document.createElement('div');
  legenda.className = 'pdad-legend';
  values.forEach((valor, i) => {
    const linha = document.createElement('div');
    linha.className = 'pdad-legend-row';
    linha.dataset.drillCategory = valor.label;
    const ponto = document.createElement('i');
    ponto.style.background = SERIES[i % SERIES.length];
    const nome = document.createElement('span');
    nome.title = valor.label;
    nome.textContent = valor.label;
    const numero = document.createElement('b');
    numero.textContent = Number.isFinite(valor.pct) ? pctText(valor.pct) : absentText(valor.status);
    linha.append(ponto, nome, numero);
    legenda.append(linha);
  });
  return legenda;
}

/** Rosca (donut) — até 6 categorias, com o valor líder no centro. */
export function buildDonut(values) {
  const ordenadas = [...values].sort((a, b) => (Number.isFinite(b.pct) ? b.pct : -1) - (Number.isFinite(a.pct) ? a.pct : -1));
  const mostradas = ordenadas.slice(0, 6);
  if (!mostradas.some((v) => Number.isFinite(v.pct))) return emptyNote('Sem valores publicados para esta seleção.');

  const svg = svgEl('svg', { viewBox: '0 0 150 150', class: 'pdad-donut-svg', role: 'img' });
  const grupo = svgEl('g', { transform: 'rotate(-90 75 75)' });
  grupo.append(...circleSegments(mostradas, { radius: 52, strokeWidth: 17, gap: 2 }));
  svg.append(grupo);

  const lider = [...mostradas].sort((a, b) => (Number.isFinite(b.pct) ? b.pct : -1) - (Number.isFinite(a.pct) ? a.pct : -1))[0];
  if (Number.isFinite(lider?.pct)) {
    const valorTxt = svgEl('text', { x: 75, y: 72, class: 'pdad-donut-val', 'text-anchor': 'middle' });
    valorTxt.textContent = pctText(lider.pct);
    const labelTxt = svgEl('text', { x: 75, y: 88, class: 'pdad-donut-lab', 'text-anchor': 'middle' });
    labelTxt.textContent = lider.label.length > 16 ? `${lider.label.slice(0, 15)}…` : lider.label;
    svg.append(valorTxt, labelTxt);
  }

  const donutBox = document.createElement('div');
  donutBox.className = 'pdad-donut-box';
  donutBox.append(svg);

  const wrap = document.createElement('div');
  wrap.className = 'pdad-donut-flex';
  wrap.append(donutBox, donutLegend(mostradas));
  return wrap;
}

/** Pizza (pie) — mesma anatomia da rosca, sem o miolo vazio. Usado por `tenure`. */
export function buildPie(values) {
  const ordenadas = [...values].sort((a, b) => (Number.isFinite(b.pct) ? b.pct : -1) - (Number.isFinite(a.pct) ? a.pct : -1));
  const mostradas = ordenadas.slice(0, 6);
  if (!mostradas.some((v) => Number.isFinite(v.pct))) return emptyNote('Sem valores publicados para esta seleção.');

  const svg = svgEl('svg', { viewBox: '0 0 150 150', class: 'pdad-donut-svg', role: 'img' });
  const grupo = svgEl('g', { transform: 'rotate(-90 75 75)' });
  grupo.append(...circleSegments(mostradas, { radius: 37.5, strokeWidth: 75, gap: 1.2 }));
  svg.append(grupo);

  const donutBox = document.createElement('div');
  donutBox.className = 'pdad-donut-box';
  donutBox.append(svg);

  const wrap = document.createElement('div');
  wrap.className = 'pdad-donut-flex';
  wrap.append(donutBox, donutLegend(mostradas));
  return wrap;
}

/** Barra empilhada — proporção lado a lado, sem eixo. Usado por `marital`. */
export function buildStack(values) {
  const ordenadas = [...values].sort((a, b) => (Number.isFinite(b.pct) ? b.pct : -1) - (Number.isFinite(a.pct) ? a.pct : -1));
  const mostradas = ordenadas.slice(0, 6);
  if (!mostradas.some((v) => Number.isFinite(v.pct))) return emptyNote('Sem valores publicados para esta seleção.');
  const total = mostradas.reduce((soma, v) => soma + (Number.isFinite(v.pct) ? v.pct : 0), 0) || 1;

  const barra = document.createElement('div');
  barra.className = 'pdad-stack-bar';
  mostradas.forEach((valor, i) => {
    const fatia = document.createElement('i');
    fatia.style.width = `${((Number.isFinite(valor.pct) ? valor.pct : 0) / total) * 100}%`;
    fatia.style.background = SERIES[i % SERIES.length];
    fatia.dataset.drillCategory = valor.label;
    fatia.title = `${valor.label}: ${Number.isFinite(valor.pct) ? pctText(valor.pct) : absentText(valor.status)}`;
    barra.append(fatia);
  });

  const wrap = document.createElement('div');
  wrap.append(barra, donutLegend(mostradas));
  return wrap;
}

/** Colunas + linha acumulada — usado por tempo de deslocamento (ordinal fechado). */
export function buildOrdline(values, order) {
  const pontos = order.map((rotulo) => values.find((v) => v.label === rotulo)).filter(Boolean);
  const extras = values.filter((v) => !order.includes(v.label));
  if (pontos.length < 2) return buildHbars(values, { cap: 8 });

  let acumulado = 0;
  const dados = pontos.map((valor) => {
    const pct = Number.isFinite(valor.pct) ? valor.pct : 0;
    acumulado = Math.min(100, acumulado + pct);
    return { ...valor, acumulado };
  });

  const W = 700; const H = 220; const mg = { l: 34, r: 16, t: 12, b: 36 };
  const iw = W - mg.l - mg.r; const ih = H - mg.t - mg.b;
  const n = dados.length; const band = iw / n;
  const y = (v) => mg.t + ih - (v / 100) * ih;
  const cx = (i) => mg.l + band * i + band / 2;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pdad-ord-svg', role: 'img' });
  for (const marca of [0, 25, 50, 75, 100]) {
    svg.append(svgEl('line', { class: 'pdad-sc-grid', x1: mg.l, x2: W - mg.r, y1: y(marca), y2: y(marca) }));
  }
  svg.append(svgEl('line', { class: 'pdad-sc-axis', x1: mg.l, x2: W - mg.r, y1: y(0), y2: y(0) }));

  const caminho = [];
  dados.forEach((valor, i) => {
    const bw = Math.min(30, band * 0.42);
    const h = Math.max(2, ((Number.isFinite(valor.pct) ? valor.pct : 0) / 100) * ih);
    const x = cx(i) - bw / 2;
    const yTopo = mg.t + ih - h;

    const g = svgEl('g');
    g.dataset.drillCategory = valor.label;
    const hit = svgEl('rect', { x: cx(i) - band * 0.44, y: mg.t, width: band * 0.88, height: ih, fill: 'transparent' });
    const barra = svgEl('rect', { x, y: yTopo, width: bw, height: h, rx: 3, fill: 'var(--cat-2)' });
    const valorTxt = svgEl('text', { class: 'pdad-ord-val', x: cx(i), y: yTopo - 6, 'text-anchor': 'middle' });
    valorTxt.textContent = pctText(valor.pct);
    const catTxt = svgEl('text', { class: 'pdad-ord-cat', x: cx(i), y: H - 8, 'text-anchor': 'middle' });
    catTxt.textContent = valor.label;
    g.append(hit, barra, valorTxt, catTxt);
    svg.append(g);
    caminho.push(`${i ? 'L' : 'M'}${cx(i)},${y(valor.acumulado)}`);
  });
  svg.append(svgEl('path', {
    d: caminho.join(' '), fill: 'none', stroke: 'var(--cat-5)', 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none',
  }));
  dados.forEach((valor, i) => {
    svg.append(svgEl('circle', {
      cx: cx(i), cy: y(valor.acumulado), r: 4, fill: 'var(--cat-5)', 'pointer-events': 'none',
    }));
  });

  const legenda = document.createElement('div');
  legenda.className = 'pdad-cmp-legend';
  const s1 = document.createElement('span'); s1.textContent = '% na faixa';
  const s2 = document.createElement('span'); s2.textContent = '% acumulado';
  legenda.append(s1, s2);
  for (const extra of extras) {
    const s = document.createElement('span');
    s.textContent = `${extra.label}: ${Number.isFinite(extra.pct) ? pctText(extra.pct) : absentText(extra.status)}`;
    legenda.append(s);
  }

  const frag = document.createDocumentFragment();
  frag.append(legenda, svg);
  return frag;
}

/**
 * Grupos (tipo de compra × destino) — usado só por `shopping` (Figura 59). `grupos`
 * vem de `indicatorGroups()`: `[{group, items}]`, cada `items` já ordenado.
 */
export function buildGroups(grupos, { cap = 5 } = {}) {
  const comItens = grupos.filter((g) => g.items.length > 0);
  if (!comItens.length) return emptyNote('Sem valores publicados para esta seleção.');

  const grade = document.createElement('div');
  grade.className = 'pdad-shop-grid';
  for (const grupo of comItens) {
    const bloco = document.createElement('div');
    bloco.className = 'pdad-shop-block';
    const titulo = document.createElement('div');
    titulo.className = 'pdad-shop-title';
    titulo.textContent = grupo.group;
    bloco.append(titulo);

    const mostrados = grupo.items.slice(0, cap);
    const resto = grupo.items.length - mostrados.length;
    const maximo = Math.max(...mostrados.map((v) => (Number.isFinite(v.pct) ? v.pct : 0)), 1);
    for (const valor of mostrados) {
      const linha = document.createElement('div');
      linha.className = 'pdad-mini-row';
      linha.dataset.drillCategory = valor.label;
      linha.dataset.drillGroup = grupo.group;
      const nome = document.createElement('span');
      nome.title = valor.label;
      nome.textContent = valor.label;
      const trilho = document.createElement('span');
      trilho.className = 'pdad-mini-trilho';
      const fill = document.createElement('span');
      fill.className = 'pdad-mini-fill';
      const pct = Number.isFinite(valor.pct) ? valor.pct : null;
      fill.style.width = pct !== null ? `${Math.max(2, (pct / maximo) * 100)}%` : '0%';
      trilho.append(fill);
      const numero = document.createElement('b');
      numero.textContent = pct !== null ? pctText(pct) : absentText(valor.status);
      linha.append(nome, trilho, numero);
      bloco.append(linha);
    }
    if (resto > 0) bloco.append(moreNote(resto));
    grade.append(bloco);
  }
  return grade;
}

/**
 * Desenha o indicador pelo tipo declarado em `PDAD_VIZ`. `yesOnly` filtra para a
 * resposta afirmativa das perguntas de múltipla escolha (água/esgoto/energia/lixo/
 * animais publicam "categoria · Sim/Não/Não sabe"; só o "Sim" interessa como resumo —
 * o resto segue disponível no drill-down).
 */
export function buildChart(viz, values, { order } = {}) {
  let dados = values;
  if (viz.yesOnly) {
    dados = values
      .filter((v) => / · Sim$/.test(v.label))
      .map((v) => ({ ...v, label: v.label.replace(/ · Sim$/, '') }));
  }
  switch (viz.kind) {
    case 'columns': return buildColumns(dados);
    case 'donut': return buildDonut(dados);
    case 'pie': return buildPie(dados);
    case 'stack': return buildStack(dados);
    case 'ordline': return buildOrdline(dados, order || []);
    default: return buildHbars(dados, { cap: viz.cap });
  }
}
