#!/usr/bin/env node
// Versiona os assets das páginas — issue #89.
//
//   node tools/versionar-assets.mjs          # reescreve index.html e admin.html
//   node tools/versionar-assets.mjs --check  # só confere, não escreve (é o que o teste usa)
//
// POR QUE ISTO EXISTE. `index.html`, `src/app.js`, os 25 módulos que ele importa e o
// `assets/styles.css` são baixados como arquivos independentes, cada um com o próprio
// relógio de cache. Nada garante que o navegador tenha as peças da MESMA versão ao mesmo
// tempo: dá para receber HTML novo com `app.js` velho, ou `app.js` novo com `cards.js`
// velho. Isso não é "a tela parece desatualizada" — é `undefined is not a function` numa
// combinação que nunca existiu em teste nenhum.
//
// POR QUE UM IMPORT MAP, E NÃO SÓ `?v=` NA ENTRADA. Pôr a query no
// `<script type="module" src="./src/app.js">` versiona UM arquivo. As importações lá dentro
// são especificadores estáticos (`import './data.js'`), a query não é herdada, e o resto do
// grafo continua vindo do cache — com a agravante de o problema parecer resolvido. O import
// map é o único mecanismo, sem etapa de build, que alcança o grafo inteiro.
//
// POR QUE O GERADOR ENUMERA O DIRETÓRIO. Uma lista escrita à mão erra por AUSÊNCIA, e a
// peça esquecida é exatamente a que fica velha — a falha silenciosa que este arquivo existe
// para impedir. Enumerar não tem como esquecer, e `tests/asset-version.test.js` confere o
// resultado a cada `npm test`.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const GERADO = 'gerado por tools/versionar-assets.mjs — não editar à mão';
const MARCADORES = Object.freeze({
  // Dois blocos, e a divisão não é estética: folhas de estilo e o import map PRECISAM estar
  // no `<head>` — o import map tem de ser lido antes de qualquer módulo carregar —, mas o
  // Leaflet é script clássico de ~150 KB e no `<head>` ele bloqueia a renderização da
  // página inteira. Ele fica onde sempre esteve, no fim do `<body>`.
  estilos: [`<!-- assets:estilos (${GERADO}) -->`, '<!-- assets:estilos:fim -->'],
  scripts: [`<!-- assets:scripts (${GERADO}) -->`, '<!-- assets:scripts:fim -->'],
});

/** Os arquivos que compõem a versão: tudo que o navegador baixa e que este repo edita. */
export function arquivosVersionados() {
  const modulos = [...listar('src')].filter((p) => p.endsWith('.js')).sort();
  const estilos = [...listar('assets')]
    .filter((p) => p.endsWith('.css') || p.endsWith('.js'))
    .sort();
  return { modulos, estilos };
}

function* listar(dir) {
  for (const nome of readdirSync(join(RAIZ, dir)).sort()) {
    const caminho = join(dir, nome);
    if (statSync(join(RAIZ, caminho)).isDirectory()) yield* listar(caminho);
    else yield caminho.split('\\').join('/');
  }
}

/**
 * O hash de TODOS os arquivos juntos, não um por arquivo.
 *
 * Eles são publicados como um conjunto — um commit, um deploy —, então a pergunta que
 * importa é "esta página inteira é a mesma versão?", e não "cada arquivo mudou?". Um hash
 * só torna impossível a mistura, que é o defeito de verdade.
 */
export function versaoDosAssets() {
  const { modulos, estilos } = arquivosVersionados();
  const hash = createHash('sha256');
  for (const caminho of [...modulos, ...estilos]) {
    hash.update(caminho);
    hash.update(readFileSync(join(RAIZ, caminho)));
  }
  return hash.digest('hex').slice(0, 10);
}

/** Os dois blocos que vão para dentro de cada página, entre os marcadores. */
export function blocosDeAssets(pagina, versao) {
  const { modulos } = arquivosVersionados();
  const mapa = Object.fromEntries(modulos.map((p) => [`./${p}`, `./${p}?v=${versao}`]));
  const entrada = pagina === 'admin' ? './src/admin/admin-app.js' : './src/app.js';
  const folhas = pagina === 'admin'
    ? ['./assets/styles.css', './assets/vendor/leaflet/leaflet.css', './assets/admin.css']
    : ['./assets/vendor/leaflet/leaflet.css', './assets/styles.css'];

  return {
    estilos: [
      MARCADORES.estilos[0],
      ...folhas.map((href) => `<link rel="stylesheet" href="${href}?v=${versao}">`),
      // O import map precisa vir ANTES de qualquer módulo carregar, e é ele que faz a
      // versão alcançar `import './data.js'` lá dentro. Navegador sem suporte ignora o
      // bloco e carrega como antes: degrada para o comportamento de hoje, não quebra.
      `<script type="importmap">${JSON.stringify({ imports: mapa }, null, 2)}</script>`,
      MARCADORES.estilos[1],
    ].join('\n'),
    scripts: [
      MARCADORES.scripts[0],
      `<script src="./assets/vendor/leaflet/leaflet.js?v=${versao}"></script>`,
      `<script src="./src/config.js?v=${versao}"></script>`,
      `<script type="module" src="${entrada}?v=${versao}"></script>`,
      MARCADORES.scripts[1],
    ].join('\n'),
  };
}

function aplicar(arquivo, pagina, versao) {
  const caminho = join(RAIZ, arquivo);
  const html = readFileSync(caminho, 'utf8');
  const blocos = blocosDeAssets(pagina, versao);
  let novo = html;

  for (const [nome, [abre, fecha]] of Object.entries(MARCADORES)) {
    const inicio = novo.indexOf(abre);
    const fim = novo.indexOf(fecha);
    if (inicio === -1 || fim === -1) {
      throw new Error(`${arquivo} não tem os marcadores de \`assets:${nome}\`.`);
    }
    novo = novo.slice(0, inicio) + blocos[nome] + novo.slice(fim + fecha.length);
  }
  return { caminho, html, novo, mudou: novo !== html };
}

const PAGINAS = Object.freeze([['index.html', 'index'], ['admin.html', 'admin']]);

export function conferir() {
  const versao = versaoDosAssets();
  return PAGINAS
    .map(([arquivo, pagina]) => ({ arquivo, ...aplicar(arquivo, pagina, versao) }))
    .filter((r) => r.mudou)
    .map((r) => r.arquivo);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const versao = versaoDosAssets();
  const somenteConferir = process.argv.includes('--check');
  const defasados = [];

  for (const [arquivo, pagina] of PAGINAS) {
    const { caminho, novo, mudou } = aplicar(arquivo, pagina, versao);
    if (!mudou) continue;
    defasados.push(arquivo);
    if (!somenteConferir) writeFileSync(caminho, novo);
  }

  if (somenteConferir && defasados.length > 0) {
    console.error(`Assets fora de sincronia (${defasados.join(', ')}). Rode: npm run versionar`);
    process.exit(1);
  }
  console.log(defasados.length === 0
    ? `Assets já em ${versao}.`
    : `Assets versionados em ${versao}: ${defasados.join(', ')}.`);
  console.log(`${arquivosVersionados().modulos.length} módulos no import map.`);
}

export { relative };
