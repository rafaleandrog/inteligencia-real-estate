import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { DadosFalsos, PERFIS, servidor } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';
import { gerarCsv, lerCsv } from '../comum/csv';

beforeEach(() => esquecerSemente());

async function montar() {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  return { s, arquivos };
}

test('semente: a cidade e as 37 RAs do GeoPortal, idempotente', async () => {
  const { s } = await montar();
  try {
    const r1 = await s.chamar('GET', '/localidades?tipo=ra&por_pagina=100');
    assert.equal(r1.status, 200);
    assert.equal(r1.corpo.total, 37);
    await s.chamar('GET', '/localidades');
    assert.equal(s.dados.linhas('localidades').length, 37);
    assert.equal(s.dados.linhas('cidades').length, 1);
  } finally {
    await s.fechar();
  }
});

test('RA_PROFILES: prévia sem gravar, aplicar, contagem fecha e reimportar não duplica', async () => {
  const { s, arquivos } = await montar();
  try {
    const perfis = aba('ra_profiles');
    const id = arquivos.subir('RA_PROFILES.csv', csvDaAba(perfis));
    // 30 das 35 linhas reais não trazem ano em coluna nenhuma: sem padrão declarado, são rejeitadas com motivo.
    const sem = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidade_perfis', upload_id: arquivos.subir('RA_PROFILES.csv', csvDaAba(perfis)) }, PERFIS.operador);
    assert.equal(sem.corpo.rejeitadas, 30);
    assert.ok(sem.corpo.rejeicoes.every((r: any) => r.coluna === 'ano_referencia' && r.codigo === 'OBRIGATORIO'));
    const previa = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidade_perfis', upload_id: id, modo_duplicata: 'ignorar', padroes: { ano_referencia: 2024 } }, PERFIS.operador);
    assert.equal(previa.status, 201, previa.texto);
    assert.equal(previa.corpo.total_linhas, 35);
    assert.equal(s.dados.linhas('localidade_perfis').length, 0, 'a prévia não grava na tabela alvo');
    assert.ok(previa.corpo.colunas_ignoradas.some((c: any) => c.cabecalho === 'ra_name' && c.motivo === 'desconhecida'));

    const ap = await s.chamar('POST', `/importacoes/${previa.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(ap.status, 200, ap.texto);
    const c = ap.corpo;
    assert.equal(c.inseridas + c.atualizadas + c.ignoradas + c.rejeitadas, 35, 'importadas + rejeitadas = linhas do retrato');
    assert.equal(c.inseridas, 35);
    const perfil = s.dados.linhas('localidade_perfis')[0];
    assert.equal(perfil.importacao_id, previa.corpo.id);

    const id2 = arquivos.subir('RA_PROFILES.csv', csvDaAba(perfis));
    const p2 = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidade_perfis', upload_id: id2, modo_duplicata: 'ignorar', padroes: { ano_referencia: 2024 } }, PERFIS.operador);
    const a2 = await s.chamar('POST', `/importacoes/${p2.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(a2.corpo.ignoradas, 35);
    assert.equal(s.dados.linhas('localidade_perfis').length, 35);
  } finally {
    await s.fechar();
  }
});

test('pontos percentuais da planilha viram fração; fração fora de [0,1] rejeita com motivo', async () => {
  const { s, arquivos } = await montar();
  try {
    const csv = gerarCsv(['ra_geo_id', 'profile_reference_year', 'female_pct', 'masculino_frac'], [
      { ra_geo_id: 'RA_01', profile_reference_year: 2024, female_pct: '52,5', masculino_frac: '0.475' },
      { ra_geo_id: 'RA_02', profile_reference_year: 2024, female_pct: '51', masculino_frac: '49' },
      { ra_geo_id: 'RA_99', profile_reference_year: 2024 },
    ]);
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidade_perfis', upload_id: arquivos.subir('p.csv', csv) }, PERFIS.operador);
    assert.equal(p.corpo.previstas.inserir, 1);
    const codigos = p.corpo.rejeicoes.map((r: any) => r.codigo).sort();
    assert.deepEqual(codigos, ['ESCALA_INDETERMINADA', 'LOCALIDADE_NAO_RESOLVIDA']);
    await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    const linha = s.dados.linhas('localidade_perfis')[0];
    assert.equal(Number(linha.feminino_frac), 0.525);
  } finally {
    await s.fechar();
  }
});

test('modo atualizar toca só as colunas presentes; falhar bloqueia a prévia com duplicata', async () => {
  const { s, arquivos } = await montar();
  try {
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidades', modo_duplicata: 'atualizar', upload_id: arquivos.subir('l.csv', gerarCsv(['codigo', 'notas'], [{ codigo: 'RA_01', notas: 'centro' }])) }, PERFIS.operador);
    assert.equal(p.corpo.previstas.atualizar, 1);
    const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(a.corpo.atualizadas, 1);
    const ra1 = s.dados.linhas('localidades').find((l) => l.codigo === 'RA_01')!;
    assert.equal(ra1.notas, 'centro');
    assert.equal(ra1.nome, 'Plano Piloto', 'coluna ausente no CSV não é tocada');
    assert.equal(ra1.versao, 2);

    const f = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidades', modo_duplicata: 'falhar', upload_id: arquivos.subir('l.csv', gerarCsv(['codigo', 'nome'], [{ codigo: 'RA_01', nome: 'X' }])) }, PERFIS.operador);
    assert.ok(f.corpo.bloqueio);
    const af = await s.chamar('POST', `/importacoes/${f.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(af.status, 409);
  } finally {
    await s.fechar();
  }
});

test('desfazer remove só as linhas criadas e não editadas; só o admin desfaz', async () => {
  const { s, arquivos } = await montar();
  try {
    const geo = (dx: number) => JSON.stringify({ type: 'Polygon', coordinates: [[[-47.9 + dx, -15.8], [-47.8 + dx, -15.8], [-47.8 + dx, -15.7], [-47.9 + dx, -15.8]]] });
    const csv = gerarCsv(['polygon_id', 'name', 'geometry_geojson', 'ra_geo_id'], [
      { polygon_id: 'P1', name: 'Um', geometry_geojson: geo(0), ra_geo_id: 'RA_01' },
      { polygon_id: 'P2', name: 'Dois', geometry_geojson: geo(0.2), ra_geo_id: 'RA_01' },
    ]);
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'contornos', upload_id: arquivos.subir('c.csv', csv) }, PERFIS.operador);
    const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(a.corpo.inseridas, 2, a.texto);
    const [c1] = s.dados.linhas('contornos');
    assert.equal(c1.grupo_camada, 'poligonais_importadas');
    assert.ok(Number(c1.area_m2) > 0);
    const ed = await s.chamar('PATCH', `/contornos/${c1.id}`, { versao: 1, nome: 'Um editado' }, PERFIS.curador);
    assert.equal(ed.status, 200, ed.texto);

    const negado = await s.chamar('POST', `/importacoes/${p.corpo.id}/desfazer`, {}, PERFIS.operador);
    assert.equal(negado.status, 403);
    const d = await s.chamar('POST', `/importacoes/${p.corpo.id}/desfazer`, {}, PERFIS.admin);
    assert.equal(d.status, 200, d.texto);
    assert.equal(d.corpo.relatorio_desfazer.removidas.length, 1);
    assert.equal(d.corpo.relatorio_desfazer.mantidas.length, 1);
    assert.equal(d.corpo.status, 'desfeita');
  } finally {
    await s.fechar();
  }
});

test('papel: leitura não faz prévia; escrita sem operador recebe PAPEL_EXIGIDO', async () => {
  const { s, arquivos } = await montar();
  try {
    const corpo = { tabela_alvo: 'localidades', upload_id: arquivos.subir('x.csv', 'codigo;nome\n') };
    assert.equal((await s.chamar('POST', '/importacoes/previa', corpo, PERFIS.leitura)).status, 403);
    const r = await s.chamar('POST', '/importacoes/previa', corpo, PERFIS.curador);
    assert.equal(r.corpo.codigo, 'PAPEL_EXIGIDO');
  } finally {
    await s.fechar();
  }
});

test('modelo: cabeçalho exato da tabela, e o CSV exportado reabre na prévia sem rejeição', async () => {
  const { s, arquivos } = await montar();
  try {
    const m = await s.chamar('GET', '/importacoes/modelo/localidades');
    assert.match(m.tipo ?? '', /text\/csv/);
    assert.ok(lerCsv(m.texto).cabecalho.includes('codigo'));
    const exp = await s.chamar('GET', '/localidades?formato=csv&tipo=ra');
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidades', upload_id: arquivos.subir('exp.csv', exp.texto) }, PERFIS.operador);
    assert.equal(p.corpo.rejeitadas, 0, JSON.stringify(p.corpo.rejeicoes));
    assert.equal(p.corpo.previstas.ignorar, 37);
    assert.equal(p.corpo.previstas.inserir, 0);
    assert.ok(p.corpo.colunas_ignoradas.some((c: any) => c.cabecalho === 'versao' && c.motivo === 'derivada'));
  } finally {
    await s.fechar();
  }
});

test('refazer a prévia com valor padrão declarado e cancelar uma prévia', async () => {
  const { s, arquivos } = await montar();
  try {
    const csv = gerarCsv(['ra_geo_id', 'population_total'], [{ ra_geo_id: 'RA_01', population_total: '100' }]);
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidade_perfis', upload_id: arquivos.subir('p.csv', csv) }, PERFIS.operador);
    assert.equal(p.status, 422, 'sem a coluna obrigatória no modo ignorar');
    const p2 = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidade_perfis', modo_duplicata: 'atualizar', upload_id: arquivos.subir('p.csv', csv) }, PERFIS.operador);
    assert.equal(p2.corpo.rejeitadas, 1);
    const r = await s.chamar('POST', `/importacoes/${p2.corpo.id}/previa`, { padroes: { ano_referencia: '2024' } }, PERFIS.operador);
    assert.equal(r.corpo.rejeitadas, 0, r.texto);
    assert.equal(r.corpo.previstas.inserir, 1);
    const c = await s.chamar('POST', `/importacoes/${p2.corpo.id}/cancelar`, {}, PERFIS.operador);
    assert.equal(c.corpo.status, 'cancelada');
    assert.equal((await s.chamar('POST', `/importacoes/${p2.corpo.id}/aplicar`, {}, PERFIS.operador)).status, 409);
  } finally {
    await s.fechar();
  }
});
