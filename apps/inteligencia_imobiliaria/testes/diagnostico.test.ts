import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { DadosFalsos, PERFIS, RAIZ_APP, servidor } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

const D = JSON.parse(readFileSync(join(RAIZ_APP, 'testes/fixtures/paridade/2026-10-18.json'), 'utf8')).diagnostico;

function perto(atual: unknown, esperado: unknown, rotulo: string) {
  if (esperado === null) return assert.equal(atual ?? null, null, rotulo);
  assert.ok(typeof atual === 'number' && Math.abs(atual - (esperado as number)) <= 1e-9 * Math.max(1, Math.abs(esperado as number)), `${rotulo}: app ${atual}, site ${esperado}`);
}

async function comPdad() {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'pdad_observacoes', upload_id: arquivos.subir('pdad.csv', csvDaAba(aba('pdad_a_data_sintetico'))) }, PERFIS.operador);
  assert.equal(p.status, 201, p.texto);
  const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
  assert.equal(a.status, 200, a.texto);
  return { s, arquivos, previa: p.corpo };
}

test('PDAD: importação rejeita a categoria numérica e guarda fração; suprimido não vira zero', async () => {
  const { s, previa } = await comPdad();
  try {
    assert.equal(previa.rejeitadas, 1, JSON.stringify(previa.rejeicoes));
    assert.equal(previa.rejeicoes[0].codigo, 'CATEGORIA_NUMERICA');
    const linhas = s.dados.linhas('pdad_observacoes');
    const sup = linhas.find((l) => l.status_valor === 'suprimido');
    assert.equal(sup?.estimativa_frac, null);
    assert.ok(linhas.every((l) => l.estimativa_frac === null || (Number(l.estimativa_frac) >= 0 && Number(l.estimativa_frac) <= 1)));
    const anos = await s.chamar('GET', '/diagnostico/anos', undefined, PERFIS.leitura);
    assert.deepEqual(anos.corpo.dados.map((a: any) => [a.ano, a.cobertura]), [[2024, 6], [2021, 1]]);
  } finally {
    await s.fechar();
  }
});

test('Perfil, ranking e dispersão batem com o código do site (paridade)', async () => {
  const { s } = await comPdad();
  try {
    const todas = await s.chamar('GET', '/diagnostico/perfil?ano=2024&localidade=todas', undefined, PERFIS.leitura);
    assert.equal(todas.status, 200, todas.texto);
    assert.equal(todas.corpo.kpis.population, D.kpis_todas.population);
    assert.equal(todas.corpo.kpis.households, D.kpis_todas.households);
    perto(todas.corpo.kpis.avgHouseholdSize, D.kpis_todas.avgHouseholdSize, 'moradores por domicílio');
    for (const [chave, serie] of Object.entries(D.serie_todas) as [string, any[]][]) {
      const cartao = todas.corpo.cartoes.find((c: any) => c.chave === chave);
      assert.ok(cartao, chave);
      assert.deepEqual(cartao.serie.map((v: any) => v.label), serie.map((v) => v.label), chave);
      serie.forEach((v, i) => perto(cartao.serie[i].pct, v.pct, `${chave}.${v.label}`));
    }
    assert.equal(todas.corpo.perfil_imobiliario, null, 'perfil imobiliário só para uma localidade');

    const ra = await s.chamar('GET', '/diagnostico/perfil?ano=2024&localidade=RA_03', undefined, PERFIS.leitura);
    for (const item of D.perfil_ra_03) {
      const app = ra.corpo.perfil_imobiliario.find((i: any) => i.id === item.id);
      perto(app.value, item.value, `${item.id}.valor`);
      assert.equal(app.status, item.status, item.id);
      perto(app.reference.median, item.mediana, `${item.id}.mediana`);
      assert.equal(app.reference.n, item.n, `${item.id}.n`);
      assert.equal(app.rank?.position ?? null, item.posicao, `${item.id}.posição`);
    }
    for (const r of D.ranking) {
      const app = await s.chamar('GET', `/diagnostico/ranking?ano=2024&indicador=${r.id}`, undefined, PERFIS.leitura);
      assert.equal(app.corpo.n, r.n, r.id);
      assert.equal(app.corpo.dados[0].codigo, r.primeira);
      perto(app.corpo.dados[0].valor, r.primeira_valor, `${r.id}.primeira`);
      assert.equal(app.corpo.dados.at(-1).codigo, r.ultima);
    }
    const disp = await s.chamar('GET', '/diagnostico/dispersao?ano=2024&leitura=vert_loc', undefined, PERFIS.leitura);
    assert.deepEqual(disp.corpo.pontos.map((p: any) => [p.codigo, p.x, p.y]), D.dispersao_vert_loc.map((p: any) => [p.codigo, p.x, p.y]));
    assert.ok(typeof disp.corpo.pearson === 'number');
    const compras = ra.corpo.cartoes.find((c: any) => c.chave === 'shopping');
    const ra01 = await s.chamar('GET', '/diagnostico/perfil?ano=2024&localidade=RA_01&tema=economia', undefined, PERFIS.leitura);
    const g = ra01.corpo.cartoes.find((c: any) => c.chave === 'shopping').grupos;
    assert.deepEqual(g.map((x: any) => ({ grupo: x.group, itens: x.items.map((i: any) => ({ label: i.label, pct: i.pct })) })), D.compras_ra_01);
    assert.ok(compras);
  } finally {
    await s.fechar();
  }
});

test('Drill-down, comparar com kit, ano padrão pela cobertura e catálogo', async () => {
  const { s } = await comPdad();
  try {
    const det = await s.chamar('GET', '/diagnostico/perfil/detalhe?ano=2024&localidade=RA_02&indicador=dwelling', undefined, PERFIS.leitura);
    assert.equal(det.corpo.linhas.length, 2);
    const kit = await s.chamar('GET', '/diagnostico/comparar?localidades=RA_01,RA_02,RA_99&kit=imob', undefined, PERFIS.leitura);
    assert.equal(kit.status, 200, kit.texto);
    assert.equal(kit.corpo.ano, 2024, 'ano padrão é o de maior cobertura');
    assert.equal(kit.corpo.indicadores.length, 4);
    assert.equal(kit.corpo.localidades.find((l: any) => l.codigo === 'RA_99').publicou, false);
    assert.equal((await s.chamar('GET', '/diagnostico/comparar?localidades=RA_01&kit=imob')).status, 400);
    assert.equal((await s.chamar('GET', '/diagnostico/perfil?ano=1999')).corpo.codigo, 'ANO_SEM_PDAD');
    const cat = await s.chamar('GET', '/diagnostico/catalogo', undefined, PERFIS.leitura);
    assert.equal(cat.corpo.dispersao.length, 9);
    assert.ok(cat.corpo.kits.imob);
    const renda = await s.chamar('GET', '/diagnostico/ranking?ano=2024&indicador=income', undefined, PERFIS.leitura);
    assert.equal(renda.corpo.n, 0);
    assert.ok(renda.corpo.ressalvas.length, 'renda sem dado vem com a ressalva escrita');
  } finally {
    await s.fechar();
  }
});

test('Base de dados lista as fontes com contagem, última importação e achados', async () => {
  const { s } = await comPdad();
  try {
    const base = await s.chamar('GET', '/diagnostico/base', undefined, PERFIS.leitura);
    assert.equal(base.status, 200, base.texto);
    const pdad = base.corpo.fontes.find((f: any) => f.tabela === 'pdad_observacoes');
    assert.ok(pdad.linhas > 50);
    assert.ok(pdad.ultima_importacao?.aplicada_em);
    assert.equal(base.corpo.fontes.find((f: any) => f.tabela === 'ivv_mensal').linhas, 0);
  } finally {
    await s.fechar();
  }
});
