import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { DadosFalsos, PERFIS, servidor } from './infra';
import { ArquivosFalsos } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

const QUADRADO = { type: 'Polygon', coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.7], [-47.9, -15.8]]] };

test('contorno desenhado: curador cria, edita com versão, conflito e histórico; leitura não cria', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    assert.equal((await s.chamar('POST', '/contornos', { nome: 'X', geometria: QUADRADO }, PERFIS.leitura)).status, 403);
    assert.equal((await s.chamar('POST', '/contornos', { nome: 'X', geometria: QUADRADO }, PERFIS.escrita)).corpo.codigo, 'PAPEL_EXIGIDO');
    const inv = await s.chamar('POST', '/contornos', { nome: 'X', geometria: { type: 'Polygon', coordinates: [[[0, 0]]] } }, PERFIS.curador);
    assert.equal(inv.corpo.codigo, 'POLIGONO_INVALIDO');
    const c = await s.chamar('POST', '/contornos', { nome: 'Área A', geometria: QUADRADO }, PERFIS.curador);
    assert.equal(c.status, 201, c.texto);
    assert.equal(c.corpo.grupo_camada, 'poligonais_desenhadas');
    const e1 = await s.chamar('PATCH', `/contornos/${c.corpo.id}`, { versao: 1, nome: 'Área B' }, PERFIS.curador);
    assert.equal(e1.corpo.versao, 2);
    const e2 = await s.chamar('PATCH', `/contornos/${c.corpo.id}`, { versao: 1, nome: 'Área C' }, PERFIS.curador);
    assert.equal(e2.status, 409);
    assert.equal(e2.corpo.codigo, 'CONFLITO_VERSAO');
    assert.ok(Array.isArray(e2.corpo.detalhes) && typeof e2.corpo.detalhes[0] === 'string');
    const h = await s.chamar('GET', `/contornos/${c.corpo.id}/historico`);
    assert.deepEqual(h.corpo.dados.map((a: any) => a.acao), ['editado', 'criado']);
    assert.deepEqual(h.corpo.dados[0].campos.nome, { antes: 'Área A', depois: 'Área B' });
  } finally {
    await s.fechar();
  }
});

test('contornos: GeoJSON por caixa, remover some da lista e restaurar volta; PATCH em removido responde REGISTRO_REMOVIDO', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const c = await s.chamar('POST', '/contornos', { nome: 'A', geometria: QUADRADO }, PERFIS.curador);
    assert.equal((await s.chamar('GET', '/contornos?bbox=-48,-16,-47.85,-15.75')).corpo.features.length, 1);
    assert.equal((await s.chamar('GET', '/contornos?bbox=-47,-16,-46,-15')).corpo.features.length, 0);
    await s.chamar('PATCH', `/contornos/${c.corpo.id}/remover`, {}, PERFIS.curador);
    assert.equal((await s.chamar('GET', '/contornos')).corpo.features.length, 0);
    const p = await s.chamar('PATCH', `/contornos/${c.corpo.id}`, { versao: 1, nome: 'B' }, PERFIS.curador);
    assert.equal(p.corpo.codigo, 'REGISTRO_REMOVIDO');
    await s.chamar('PATCH', `/contornos/${c.corpo.id}/restaurar`, {}, PERFIS.curador);
    assert.equal((await s.chamar('GET', '/contornos')).corpo.features.length, 1);
  } finally {
    await s.fechar();
  }
});

test('KMZ do Urbigis/Magis: prévia das feições, aplicar sem duplicar por hash, desfazer', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const kml = `<kml><Document><Placemark><name>Lote 1</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-47.9,-15.8 -47.8,-15.8 -47.8,-15.7 -47.9,-15.8</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const id = arquivos.subir('magis.kmz', zipSync({ 'doc.kml': strToU8(kml) }), 'application/octet-stream');
    const p = await s.chamar('POST', '/contornos/importar', { upload_id: id }, PERFIS.curador);
    assert.equal(p.status, 201, p.texto);
    assert.equal(p.corpo.formato, 'kmz');
    assert.equal(p.corpo.feicoes.length, 1);
    assert.equal(s.dados.linhas('contornos').length, 0);
    const a = await s.chamar('POST', `/contornos/importar/${p.corpo.importacao_id}/aplicar`, { categoria: 'magis' }, PERFIS.curador);
    assert.equal(a.corpo.inseridas, 1, a.texto);
    const p2 = await s.chamar('POST', '/contornos/importar', { upload_id: arquivos.subir('magis.kmz', zipSync({ 'doc.kml': strToU8(kml) })) }, PERFIS.curador);
    const a2 = await s.chamar('POST', `/contornos/importar/${p2.corpo.importacao_id}/aplicar`, {}, PERFIS.curador);
    assert.equal(a2.corpo.ignoradas, 1);
    const d = await s.chamar('POST', `/importacoes/${p.corpo.importacao_id}/desfazer`, {}, PERFIS.admin);
    assert.equal(d.corpo.relatorio_desfazer.removidas.length, 1);
  } finally {
    await s.fechar();
  }
});

test('localidades: lista com perfil e contorno, detalhe, curador cria submercado e não cria RA', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const l = await s.chamar('GET', '/localidades?q=plano');
    assert.equal(l.corpo.total, 1);
    assert.equal(l.corpo.dados[0].perfil, null);
    const det = await s.chamar('GET', `/localidades/${l.corpo.dados[0].id}`);
    assert.equal(det.corpo.codigo, 'RA_01');
    const ra = await s.chamar('POST', '/localidades', { tipo: 'ra', codigo: 'RA_99', nome: 'Nova' }, PERFIS.curador);
    assert.equal(ra.status, 422);
    const sub = await s.chamar('POST', '/localidades', { tipo: 'submercado', codigo: 'ASA_SUL', nome: 'Asa Sul', localidade_pai_id: l.corpo.dados[0].id }, PERFIS.curador);
    assert.equal(sub.status, 201, sub.texto);
  } finally {
    await s.fechar();
  }
});
