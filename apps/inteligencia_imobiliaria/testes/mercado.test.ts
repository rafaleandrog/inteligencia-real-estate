import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { DadosFalsos, PERFIS, RAIZ_APP, servidor } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

const PARIDADE = JSON.parse(readFileSync(join(RAIZ_APP, 'testes/fixtures/paridade/2026-10-18.json'), 'utf8'));

async function importar(s: Awaited<ReturnType<typeof servidor>>, arquivos: ArquivosFalsos, tabela: string, csv: string) {
  const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: tabela, upload_id: arquivos.subir(`${tabela}.csv`, csv) }, PERFIS.operador);
  assert.equal(p.status, 201, p.texto);
  const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
  assert.equal(a.status, 200, a.texto);
  return { previa: p.corpo, aplicada: a.corpo };
}

function perto(atual: unknown, esperado: unknown, rotulo: string) {
  if (esperado === null) return assert.equal(atual, null, rotulo);
  assert.ok(typeof atual === 'number' && Math.abs(atual - (esperado as number)) <= 1e-9 * Math.max(1, Math.abs(esperado as number)), `${rotulo}: app ${atual}, site ${esperado}`);
}

test('IVV: os números do Mercado batem com o motor do site em quatro recortes (paridade)', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const { previa } = await importar(s, arquivos, 'ivv_mensal', csvDaAba(aba('ivv_monthly_sintetico')));
    assert.equal(previa.rejeitadas, 0, JSON.stringify(previa.rejeicoes));
    assert.ok(previa.colunas_ignoradas.some((c: any) => c.cabecalho === 'sales_units_ytd' && c.motivo === 'extras'));
    let conferidos = 0;
    for (const caso of PARIDADE.mercado) {
      const r = await s.chamar('GET', `/mercado/ivv/periodo?${new URLSearchParams(caso.query)}`, undefined, PERFIS.leitura);
      assert.equal(r.status, 200, r.texto);
      for (const [k, v] of Object.entries(caso.valores)) { perto(r.corpo.atual.valores[k]?.value ?? null, v, `${caso.nome}.${k}`); conferidos++; }
      const derivados = Object.fromEntries(r.corpo.atual.derivados.map((d: any) => [d.key, d.raw]));
      for (const [k, v] of Object.entries(caso.derivados)) { perto(derivados[k], v, `${caso.nome}.${k}`); conferidos++; }
    }
    assert.ok(conferidos >= 30, `${conferidos} valores conferidos`);
  } finally {
    await s.fechar();
  }
});

test('IVV: série com natureza, comparação, acumulado e sazonalidade', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    await importar(s, arquivos, 'ivv_mensal', csvDaAba(aba('ivv_monthly_sintetico')));
    const serie = await s.chamar('GET', '/mercado/ivv?de=2024-03&ate=2024-05', undefined, PERFIS.leitura);
    assert.equal(serie.corpo.meses.length, 3);
    assert.equal(serie.corpo.metricas.find((m: any) => m.chave === 'sales_units').natureza, 'fluxo');
    assert.equal(serie.corpo.metricas.find((m: any) => m.chave === 'offers_units').natureza, 'estoque');
    const comp = await s.chamar('GET', '/mercado/ivv/periodo?modo=ytd&ano=2025&mes=6&comparar=ano_anterior', undefined, PERFIS.leitura);
    assert.equal(comp.corpo.comparacao.inicio, '2024-01');
    assert.equal(comp.corpo.comparacao.fim, '2024-06');
    assert.equal(comp.corpo.comparacao.meses_com_dado, 6);
    const ant = await s.chamar('GET', '/mercado/ivv/periodo?modo=month&ano=2025&mes=1&comparar=anterior', undefined, PERFIS.leitura);
    assert.equal(ant.corpo.comparacao.inicio, '2024-12');
    const acc = await s.chamar('GET', '/mercado/ivv/acumulado?ano=2024', undefined, PERFIS.leitura);
    assert.equal(acc.corpo.series.sales_units.length, 12);
    assert.ok(!('launches_developments' in acc.corpo.series), 'não somável fica fora do acumulado');
    const saz = await s.chamar('GET', '/mercado/ivv/sazonalidade?metrica=ivv_pct', undefined, PERFIS.leitura);
    assert.deepEqual(Object.keys(saz.corpo.anos).sort(), ['2024', '2025']);
    assert.equal((await s.chamar('GET', '/mercado/ivv/sazonalidade?metrica=nada')).corpo.codigo, 'METRICA_DESCONHECIDA');
  } finally {
    await s.fechar();
  }
});

test('IVV publicado divergente do recalculado vira achado, não correção', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const csv = csvDaAba([{ reference_date: '2026-01-01', ivv_pct: '0.20', offers_units: '1000', sales_units: '50' }]);
    await importar(s, arquivos, 'ivv_mensal', csv);
    assert.equal(Number(s.dados.linhas('ivv_mensal')[0].ivv_frac), 0.2);
    assert.ok(s.dados.linhas('achados_qualidade').some((a) => a.codigo === 'IVV_DIVERGENTE'));
    const fora = csvDaAba([{ reference_date: '2026-02-01', ivv_pct: '6.5' }]);
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'ivv_mensal', upload_id: arquivos.subir('x.csv', fora) }, PERFIS.operador);
    assert.equal(p.corpo.rejeicoes[0].codigo, 'ESCALA_INDETERMINADA');
  } finally {
    await s.fechar();
  }
});

test('IVV por localidade: ranking, régua DF Total e matriz batem com o site; desfazer apaga a série', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const { previa, aplicada } = await importar(s, arquivos, 'ivv_regional', csvDaAba(aba('ivv_region')));
    assert.equal(aplicada.inseridas, 95, JSON.stringify(previa.rejeicoes?.slice(0, 3)));
    for (const caso of PARIDADE.ivv_regional) {
      const r = await s.chamar('GET', `/mercado/ivv-regional?faixa_quartos=${encodeURIComponent(caso.faixa)}`, undefined, PERFIS.leitura);
      assert.equal(r.status, 200, r.texto);
      assert.equal(r.corpo.mes, caso.mes);
      perto(r.corpo.referencia?.ivvPct ?? null, caso.referencia_ivv_pp, `${caso.faixa}.referencia`);
      assert.equal(r.corpo.ranking[0]?.region ?? null, caso.primeira);
      perto(r.corpo.ranking[0]?.ivvPct ?? null, caso.primeira_ivv_pp, `${caso.faixa}.primeira`);
      assert.equal(r.corpo.ranking.length, caso.regioes);
      assert.equal(r.corpo.sem_valor.length, caso.sem_valor);
      assert.equal(r.corpo.leituras.length, 3);
      assert.ok(r.corpo.ranking.every((x: any) => x.region !== 'DF Total'), 'DF Total é régua, nunca barra');
    }
    assert.equal(s.dados.linhas('ivv_regional').find((l) => l.nome_regiao_fonte === 'DF Total')?.agregado_total, true);
    const des = await s.chamar('POST', `/importacoes/${previa.id}/desfazer`, {}, PERFIS.admin);
    assert.equal(des.status, 200, des.texto);
    assert.equal(s.dados.linhas('ivv_regional').length, 0);
  } finally {
    await s.fechar();
  }
});
