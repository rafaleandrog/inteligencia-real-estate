// As páginas carregam UMA versão dos assets, não uma mistura — issue #89.
//
// O defeito que este teste impede não é a tela ficar velha por dez minutos: é o navegador
// montar a página com peças de DUAS versões. `index.html`, `src/app.js`, os 25 módulos que
// ele importa e o CSS são arquivos independentes com relógios de cache independentes, e uma
// combinação de HTML novo com `cards.js` velho é `undefined is not a function` num estado
// que nunca existiu em teste nenhum.
//
// O mecanismo é gerado (`tools/versionar-assets.mjs`) e ESTE arquivo é quem cobra: sem
// alguém falhando quando o HTML sai de sincronia, o gerador vira ritual que se esquece de
// rodar na primeira pressa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  versaoDosAssets, arquivosVersionados, blocosDeAssets, conferir,
} from '../tools/versionar-assets.mjs';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGINAS = [['../index.html', 'index'], ['../admin.html', 'admin']];

test('as páginas estão em sincronia com o conteúdo atual dos assets', () => {
  // Editar um módulo e não regenerar quebra AQUI, nomeando a página defasada — em vez de
  // quebrar no navegador de quem abriu a tela depois do deploy.
  assert.deepEqual(conferir(), [],
    'assets fora de sincronia; rode `npm run versionar` e commite o resultado');
});

test('toda referência de uma página carrega a MESMA versão', () => {
  const versao = versaoDosAssets();
  for (const [arquivo] of PAGINAS) {
    const html = ler(arquivo);
    const versoes = new Set([...html.matchAll(/\?v=([a-f0-9]+)/g)].map((m) => m[1]));
    assert.deepEqual([...versoes], [versao],
      `${arquivo} mistura versões — é exatamente a combinação que este mecanismo impede`);
  }
});

test('o import map cobre TODOS os módulos que existem, nem um a mais nem a menos', () => {
  // A lista vem da enumeração do diretório, não de digitação: lista à mão erra por ausência,
  // e a peça esquecida é justamente a que fica velha.
  const { modulos } = arquivosVersionados();
  for (const [arquivo] of PAGINAS) {
    const mapa = JSON.parse(ler(arquivo).match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(
      Object.keys(mapa.imports).sort(),
      modulos.map((p) => `./${p}`).sort(),
      `${arquivo}: import map divergiu dos módulos em src/`,
    );
  }
});

test('nenhum asset próprio é referenciado sem versão', () => {
  for (const [arquivo] of PAGINAS) {
    const html = ler(arquivo);
    const semVersao = [...html.matchAll(/(?:src|href)="(\.\/(?:src|assets)\/[^"?]+)"/g)]
      .map((m) => m[1]);
    assert.deepEqual(semVersao, [], `${arquivo} tem referência sem \`?v=\``);
  }
});

test('a versão muda quando o conteúdo muda — e só então', () => {
  const antes = versaoDosAssets();
  assert.equal(versaoDosAssets(), antes, 'o hash tem que ser estável para o mesmo conteúdo');
  assert.match(antes, /^[a-f0-9]{10}$/);

  // O bloco gerado é função pura do conteúdo: mesma versão, mesmo bloco.
  const bloco = blocosDeAssets('index', antes);
  assert.deepEqual(blocosDeAssets('index', antes), bloco);
  assert.notDeepEqual(blocosDeAssets('index', 'outra'), bloco);
});

test('o import map vem ANTES do primeiro módulo, ou não vale para nada', () => {
  for (const [arquivo] of PAGINAS) {
    const html = ler(arquivo);
    assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'),
      `${arquivo}: import map depois do módulo é ignorado pelo navegador, em silêncio`);
  }
});

test('o Leaflet continua no fim do body, e não bloqueando a renderização', () => {
  // Ele é script clássico de ~150 KB: no `<head>` ele para o desenho da página inteira até
  // baixar. O import map obriga o `<head>`; o Leaflet, não.
  for (const [arquivo] of PAGINAS) {
    const html = ler(arquivo);
    assert.ok(html.indexOf('leaflet.js?v=') > html.indexOf('</head>'), `${arquivo}`);
  }
});
