import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { DadosFalsos, PERFIS, servidor } from './infra';
import { ArquivosFalsos } from './arquivos-falsos';
import { gerarCsv } from '../comum/csv';

beforeEach(() => esquecerSemente());

const quadrado = (lon: number, lat: number) => JSON.stringify({ type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.002, lat], [lon + 0.002, lat + 0.002], [lon, lat + 0.002], [lon, lat]]] });

test('grade: importa células e métricas, lista o catálogo e devolve o mapa com classe e legenda', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const cabecalho = ['grade', 'codigo', 'ra_geo_id', 'centroide_latitude', 'centroide_longitude', 'geometria', 'area_km2'];
    const csvCelulas = gerarCsv(cabecalho, [
      { grade: 'h3_r9', codigo: '89a8c241a43ffff', ra_geo_id: 'RA_10', centroide_latitude: -15.82, centroide_longitude: -47.98, geometria: quadrado(-47.98, -15.82), area_km2: '0.105' },
      { grade: 'h3_r9', codigo: '89a8c241a47ffff', ra_geo_id: 'RA_10', centroide_latitude: -15.83, centroide_longitude: -47.97, geometria: quadrado(-47.97, -15.83), area_km2: '0.105' },
    ]);
    const pc = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'celulas', upload_id: arquivos.subir('celulas.csv', csvCelulas) }, PERFIS.operador);
    assert.equal(pc.status, 201, pc.texto);
    assert.equal(pc.corpo.rejeitadas, 0, JSON.stringify(pc.corpo.rejeicoes));
    const ac = await s.chamar('POST', `/importacoes/${pc.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(ac.corpo.inseridas, 2, ac.texto);

    const csvMetricas = gerarCsv(['grade', 'celula', 'conjunto_codigo', 'ano', 'metrica', 'valor', 'classe'], [
      { grade: 'h3_r9', celula: '89a8c241a43ffff', conjunto_codigo: 'jobs_hex', ano: 2019, metrica: 'jobs_total', valor: 120, classe: 4 },
      { grade: 'h3_r9', celula: '89a8c241a47ffff', conjunto_codigo: 'jobs_hex', ano: 2019, metrica: 'jobs_total', valor: 3, classe: 0 },
      { grade: 'h3_r9', celula: 'inexistente', conjunto_codigo: 'jobs_hex', ano: 2019, metrica: 'jobs_total', valor: 1, classe: 0 },
    ]);
    const pm = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'celula_metricas', upload_id: arquivos.subir('met.csv', csvMetricas) }, PERFIS.operador);
    assert.equal(pm.status, 201, pm.texto);
    assert.equal(pm.corpo.rejeitadas, 1, 'a célula inexistente é rejeitada com motivo');
    assert.equal(pm.corpo.rejeicoes[0].codigo, 'CELULA_NAO_RESOLVIDA');
    const am = await s.chamar('POST', `/importacoes/${pm.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(am.corpo.inseridas, 2, am.texto);

    const cat = await s.chamar('GET', '/celulas/catalogo', undefined, PERFIS.operador);
    assert.equal(cat.status, 200, cat.texto);
    assert.equal(cat.corpo.dados[0].metrica, 'jobs_total');
    assert.equal(cat.corpo.dados[0].n, 2);

    const mapa = await s.chamar('GET', '/celulas/mapa?conjunto=jobs_hex&metrica=jobs_total&ano=2019', undefined, PERFIS.operador);
    assert.equal(mapa.status, 200, mapa.texto);
    assert.equal(mapa.corpo.features.length, 2);
    assert.deepEqual(mapa.corpo.features.map((f: any) => f.properties.classe).sort(), [0, 4]);
    assert.equal(mapa.corpo.legenda.length, 2);
    assert.equal(mapa.corpo.features[0].geometry.type, 'Polygon');
    assert.equal(mapa.corpo.metrica.rotulo, 'Empregos formais');

    const sem = await s.chamar('GET', '/celulas/mapa?conjunto=jobs_hex', undefined, PERFIS.operador);
    assert.equal(sem.status, 422);
  } finally {
    await s.fechar();
  }
});
