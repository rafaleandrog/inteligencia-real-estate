import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { gerarCsv } from '../comum/csv';
import { DadosFalsos, PERFIS, servidor } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

const FIPEZAP_MAP = [
  { locality_map_id: 'FZMAP_ASA_SUL', source_locality_name: 'ASA SUL', ra_name: 'Plano Piloto', ra_geo_id: 'RA_01', geography_classification: 'SUBMERCADO_FIPE', mapping_rule: 'Mantém submercado; normaliza para Plano Piloto', valid_from: '2024-01-01' },
  { locality_map_id: 'FZMAP_AGUAS_CLARAS', source_locality_name: 'ÁGUAS CLARAS', ra_name: 'Águas Claras', ra_geo_id: 'RA_20', geography_classification: 'RA_OU_LOCALIDADE_FIPE' },
  { locality_map_id: 'FZMAP_BRASILIA', source_locality_name: 'BRASILIA', ra_name: '', ra_geo_id: '', geography_classification: 'AGREGADO_DF' },
];

test('migração passo 3: FIPEZAP_LOCALITY_MAP vira submercados com a RA como pai e o nome da fonte preservado', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'localidades', upload_id: arquivos.subir('fz.csv', gerarCsv(Object.keys(FIPEZAP_MAP[0]), FIPEZAP_MAP)) }, PERFIS.operador);
    assert.equal(p.status, 201, p.texto);
    assert.equal(p.corpo.rejeitadas, 0, JSON.stringify(p.corpo.rejeicoes));
    const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(a.corpo.inseridas, 3);
    const locs = s.dados.linhas('localidades');
    const asaSul = locs.find((l) => l.codigo === 'FZMAP_ASA_SUL')!;
    const ra1 = locs.find((l) => l.codigo === 'RA_01')!;
    assert.equal(asaSul.tipo, 'submercado');
    assert.equal(asaSul.nome, 'Asa Sul');
    assert.equal(asaSul.nome_fonte, 'ASA SUL');
    assert.equal(asaSul.localidade_pai_id, ra1.id);
    assert.equal(locs.find((l) => l.codigo === 'FZMAP_BRASILIA')!.tipo, 'agregado');
    assert.equal(ra1.nome, 'Plano Piloto', 'a RA não é tocada');
  } finally {
    await s.fechar();
  }
});

test('migração na ordem da spec (passos 1, 4, 5, 6, 7, 10): contagens fecham e cada aplicar registra a coleta', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  const quadrado = (dx: number) => JSON.stringify({ type: 'Polygon', coordinates: [[[-47.9 + dx, -15.8], [-47.8 + dx, -15.8], [-47.8 + dx, -15.7], [-47.9 + dx, -15.8]]] });
  const passos: [string, string, Record<string, unknown>?][] = [
    ['localidade_perfis', csvDaAba(aba('ra_profiles')), { ano_referencia: 2024 }],
    ['contornos', gerarCsv(['polygon_id', 'name', 'entity_type', 'entity_id', 'geometry_role', 'layer_group', 'geometry_geojson', 'ra_geo_id'], [
      { polygon_id: 'POLY_RA_01', name: 'Plano Piloto', entity_type: 'administrative_region', entity_id: 'RA_01', geometry_role: 'display_boundary', layer_group: 'administrative_regions', geometry_geojson: quadrado(0), ra_geo_id: 'RA_01' },
      { polygon_id: 'POLY_RA_02', name: 'Gama', entity_type: 'administrative_region', entity_id: 'RA_02', geometry_role: 'display_boundary', layer_group: 'administrative_regions', geometry_geojson: quadrado(-0.2), ra_geo_id: 'RA_02' },
    ])],
    ['ancoras', csvDaAba(aba('anchors'))],
    ['fontes_portal', gerarCsv(['source_id', 'source_name', 'base_url', 'active'], [{ source_id: 'SRC_PORTAL_DFIMOVEIS', source_name: 'DFImoveis', base_url: 'https://www.dfimoveis.com.br', active: 'false' }])],
    ['anuncios', csvDaAba(aba('listings'))],
    ['lancamentos', csvDaAba(aba('developments'))],
  ];
  try {
    for (const [tabela, csv, padroes] of passos) {
      const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: tabela, upload_id: arquivos.subir(`${tabela}.csv`, csv), padroes }, PERFIS.carga);
      assert.equal(p.status, 201, `${tabela}: ${p.texto}`);
      const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.carga);
      assert.equal(a.status, 200, `${tabela}: ${a.texto}`);
      const c = a.corpo;
      assert.equal(c.inseridas + c.atualizadas + c.ignoradas + c.rejeitadas, c.total_linhas, `${tabela}: contagem fecha`);
      assert.equal(c.rejeitadas, 0, `${tabela}: ${JSON.stringify(c.rejeicoes?.slice(0, 2))}`);
      assert.equal(c.autor_id, PERFIS.carga.id, 'a carga por agente aparece com o autor dela');
      const coleta = await s.chamar('GET', `/coletas/${c.coleta_id}`);
      assert.equal(coleta.corpo.tipo, 'importacao');
      assert.equal(coleta.corpo.novos, c.inseridas);
    }
    // A fonte importada no passo 6 é reaproveitada pelos anúncios (DFImoveis); as outras duas nascem inativas.
    assert.equal(s.dados.linhas('fontes_portal').length, 3);
    const execucoes = await s.chamar('GET', '/coletas?tipo=importacao');
    assert.equal(execucoes.corpo.total, passos.length);
    // A carga por agente não desfaz.
    const imp = (await s.chamar('GET', '/importacoes')).corpo.dados[0];
    assert.equal((await s.chamar('POST', `/importacoes/${imp.id}/desfazer`, {}, PERFIS.carga)).status, 403);
  } finally {
    await s.fechar();
  }
});
