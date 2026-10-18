import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { mediana, percentil, resumo } from '../backend/metricas/estatistica';
import { DadosFalsos, PERFIS, RAIZ_APP, servidor } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

test('estatística: mediana e percentil do site; supressão por amostra', () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 2, 3]), 2.5);
  assert.equal(mediana([]), null);
  assert.equal(percentil([1, 2, 3, 4, 5], 25), 2);
  assert.equal(percentil([10, 20], 50), 15);
  const r = resumo([1, 2, 3]);
  assert.equal(r.mediana, null);
  assert.deepEqual(r.indisponivel.mediana, { motivo: 'amostra_pequena', n: 3, minimo: 5 });
  assert.equal(resumo([1, 2, 3, 4, 5]).mediana, 3);
  assert.equal(resumo([1, 2, 3, 4, 5]).p25, null);
  assert.notEqual(resumo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).p25, null);
});

const ARQUIVO_PARIDADE = readdirSync(join(RAIZ_APP, 'testes/fixtures/paridade')).sort().at(-1)!;
const PARIDADE = JSON.parse(readFileSync(join(RAIZ_APP, 'testes/fixtures/paridade', ARQUIVO_PARIDADE), 'utf8'));

test(`paridade do mapa com o site (${ARQUIVO_PARIDADE}, site ${String(PARIDADE.site_commit).slice(0, 12)})`, async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'anuncios', upload_id: arquivos.subir('l.csv', csvDaAba(aba('listings'))) }, PERFIS.operador);
    await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(PARIDADE.mapa.length, 10);
    for (const c of PARIDADE.mapa) {
      const q = new URLSearchParams(c.query).toString();
      const k = await s.chamar('GET', `/anuncios/kpis?${q}`);
      assert.equal(k.status, 200, k.texto);
      assert.equal(k.corpo.anuncios, c.anuncios, `${c.nome}: contagem`);
      if (c.amostra_preco_m2 >= 5) {
        assert.ok(Math.abs(k.corpo.preco_m2.mediana - c.mediana_preco_m2) < 0.01, `${c.nome}: mediana ${k.corpo.preco_m2.mediana} × site ${c.mediana_preco_m2}`);
      } else {
        assert.equal(k.corpo.preco_m2.mediana, null, `${c.nome}: amostra pequena não mostra mediana`);
      }
      const pontos = await s.chamar('GET', `/anuncios/mapa?${q}`);
      assert.equal(pontos.corpo.total, c.anuncios);
    }
  } finally {
    await s.fechar();
  }
});

test('mapa: pontos de lançamentos só com coordenada e âncoras por grupo', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    for (const [tabela, nome] of [['lancamentos', 'developments'], ['ancoras', 'anchors']]) {
      const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: tabela, upload_id: arquivos.subir('x.csv', csvDaAba(aba(nome))) }, PERFIS.operador);
      await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    }
    const l = await s.chamar('GET', '/lancamentos/mapa');
    assert.equal(l.corpo.total, 15, '7 dos 22 lançamentos não têm coordenada');
    const a = await s.chamar('GET', '/ancoras/mapa?grupo=comercio_servico');
    assert.equal(a.corpo.total, 9);
  } finally {
    await s.fechar();
  }
});
