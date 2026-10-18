import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { gerarCsv } from '../comum/csv';
import { DadosFalsos, PERFIS, servidor } from './infra';
import { ArquivosFalsos } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

const QUADRADO = { type: 'Polygon', coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.7], [-47.9, -15.8]]] };
const placemark = (nome: string, x: number) => `<Placemark><name>${nome}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${x},-15.6 ${x + 0.1},-15.6 ${x + 0.1},-15.5 ${x},-15.6</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
const KML = `<kml><Document>${placemark('Gleba A', -47.7)}${placemark('Gleba B', -47.5)}<Placemark><name>Estrada</name><LineString><coordinates>-47.7,-15.6 -47.6,-15.5</coordinates></LineString></Placemark></Document></kml>`;

test('área por desenho e por ponto: localidade, responsável padrão e dossiê como fase futura', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const d = await s.chamar('POST', '/estudos', { nome: 'Desenhada', geometria: QUADRADO }, PERFIS.autor);
    assert.equal(d.status, 201, d.texto);
    assert.equal(d.corpo.tipo, 'prospeccao');
    assert.equal(d.corpo.estagio, 'sinal');
    assert.equal(d.corpo.responsavel_id, PERFIS.autor.id);
    assert.ok(Number(d.corpo.area_m2) > 0);
    const p = await s.chamar('POST', '/estudos', { nome: 'Ponto', latitude: -15.79, longitude: -47.88 }, PERFIS.autor);
    assert.equal(p.corpo.geometria_tipo, 'Point');
    assert.equal((await s.chamar('POST', '/estudos', { nome: 'Linha', geometria: { type: 'LineString', coordinates: [[-47.9, -15.8], [-47.8, -15.7]] } }, PERFIS.autor)).corpo.codigo, 'POLIGONO_INVALIDO');
    assert.equal((await s.chamar('POST', '/estudos', { nome: 'Sem geo' }, PERFIS.autor)).status, 422);
    const det = await s.chamar('GET', `/estudos/${d.corpo.id}`, undefined, PERFIS.leitura);
    assert.equal(det.corpo.indisponivel.dossie.motivo, 'fase_futura');
    assert.equal(det.corpo.pode_editar, false);
    assert.equal((await s.chamar('GET', `/estudos/${d.corpo.id}`, undefined, PERFIS.autor)).corpo.pode_editar, true);
  } finally {
    await s.fechar();
  }
});

test('estágio: decisão exige decisor e motivo, grava quem decidiu; encerrar exige motivo do encerramento', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const a = (await s.chamar('POST', '/estudos', { nome: 'A', geometria: QUADRADO }, PERFIS.autor)).corpo;
    const sem = await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'iniciativa', motivo: 'x', versao: 1 }, PERFIS.autor);
    assert.equal(sem.status, 403);
    assert.equal(sem.corpo.codigo, 'PAPEL_EXIGIDO');
    assert.equal((await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'hipotese', versao: 1 }, PERFIS.autor)).status, 200);
    assert.equal((await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'iniciativa', versao: 2 }, PERFIS.decisor)).corpo.codigo, 'MOTIVO_OBRIGATORIO');
    const ok = await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'iniciativa', motivo: 'Comitê aprovou o estudo', versao: 2 }, PERFIS.decisor);
    assert.equal(ok.status, 200, ok.texto);
    const hist = (await s.chamar('GET', `/estudos/${a.id}/historico`)).corpo.dados;
    const decisao = hist.find((h: any) => h.campos?.estagio?.depois === 'iniciativa');
    assert.equal(decisao.autor_id, PERFIS.decisor.id);
    assert.equal(decisao.motivo, 'Comitê aprovou o estudo');
    assert.equal((await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'encerrada', motivo: 'fim', versao: 3 }, PERFIS.decisor)).corpo.codigo, 'MOTIVO_OBRIGATORIO');
    const enc = await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'encerrada', motivo: 'fim', motivo_encerramento: 'zoneamento não permite', versao: 3 }, PERFIS.decisor);
    assert.equal(enc.corpo.estagio, 'encerrada');
    // O decisor que não é autor nem curador não edita o resto da área.
    assert.equal((await s.chamar('PATCH', `/estudos/${a.id}`, { nome: 'B', versao: 4 }, PERFIS.decisor)).corpo.codigo, 'OBJETO_SEM_PERMISSAO');
    assert.equal((await s.chamar('PATCH', `/estudos/${a.id}`, { nome: 'B', versao: 1 }, PERFIS.autor)).corpo.codigo, 'CONFLITO_VERSAO');
  } finally {
    await s.fechar();
  }
});

test('KMZ do Urbigis/Magis: prévia, aplicar sem duplicar, linha rejeitada e desfazer', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const kmz = () => arquivos.subir('magis.kmz', zipSync({ 'doc.kml': strToU8(KML) }), 'application/octet-stream');
    const p = await s.chamar('POST', '/estudos/importar', { upload_id: kmz() }, PERFIS.autor);
    assert.equal(p.status, 201, p.texto);
    assert.equal(p.corpo.feicoes.length, 3);
    assert.equal(p.corpo.feicoes.filter((f: any) => f.erros.length).length, 1);
    const a = await s.chamar('POST', `/estudos/importar/${p.corpo.importacao_id}/aplicar`, { tipo: 'prospeccao' }, PERFIS.autor);
    assert.equal(a.status, 200, a.texto);
    assert.equal(a.corpo.inseridas, 2);
    assert.equal(a.corpo.rejeitadas, 1);
    const areas = s.dados.linhas('areas_estudo');
    assert.ok(areas.every((x) => x.importacao_id === p.corpo.importacao_id && x.arquivo_origem && x.autor_id === PERFIS.autor.id));
    const p2 = await s.chamar('POST', '/estudos/importar', { upload_id: kmz() }, PERFIS.autor);
    const a2 = await s.chamar('POST', `/estudos/importar/${p2.corpo.importacao_id}/aplicar`, {}, PERFIS.autor);
    assert.equal(a2.corpo.inseridas, 0);
    assert.equal(a2.corpo.ignoradas, 2);
    const des = await s.chamar('POST', `/importacoes/${p.corpo.importacao_id}/desfazer`, {}, PERFIS.admin);
    assert.equal(des.status, 200, des.texto);
    assert.equal((await s.chamar('GET', '/estudos')).corpo.total, 0);
  } finally {
    await s.fechar();
  }
});

test('vínculo e atributos na área: sigilo herdado, escrita pela regra da área, filtro na lista', async () => {
  const modulos = { imobiliario: { async buscarPorChave(_t: string, _c: string[], v: any[]) { return { achados: new Map(v.map((x) => [String(x.id), { id: Number(x.id) }])) }; } } };
  const s = await servidor(rotas, new DadosFalsos(), { modulos });
  try {
    const propria = (await s.chamar('POST', '/estudos', { nome: 'UP', tipo: 'propria', geometria: QUADRADO, responsavel_id: PERFIS.responsavel.id }, PERFIS.curador)).corpo;
    const q = (await s.chamar('POST', '/estudos', { nome: 'Q', latitude: -15.7, longitude: -47.8 }, PERFIS.autor)).corpo;
    const v = await s.chamar('POST', '/vinculos-nucleo', { objeto_tipo: 'area_estudo', objeto_id: propria.id, entidade: 'imoveis', nucleo_subtipo: 'lote', nucleo_id: 100 }, PERFIS.curador);
    assert.equal(v.status, 201, v.texto);
    assert.equal((await s.chamar('POST', '/vinculos-nucleo', { objeto_tipo: 'area_estudo', objeto_id: q.id, entidade: 'matriculas', nucleo_id: 9 }, PERFIS.curador)).status, 201);
    assert.equal((await s.chamar('GET', '/vinculos-nucleo', undefined, PERFIS.leitura)).corpo.total, 1, 'vínculo da área própria some para quem não a lê');
    assert.equal((await s.chamar('GET', '/vinculos-nucleo', undefined, PERFIS.responsavel)).corpo.total, 2);
    assert.equal((await s.chamar('GET', `/vinculos-nucleo/${v.corpo.id}/historico`, undefined, PERFIS.leitura)).status, 404);

    const def = (await s.chamar('POST', '/atributos', { codigo: 'potencial_unidades', nome: 'Potencial de unidades', tipo_valor: 'numero', unidade: 'un', aplica_a: ['area_estudo'] }, PERFIS.curador)).corpo;
    const def2 = (await s.chamar('POST', '/atributos', { codigo: 'zona_pdot', nome: 'Zona do PDOT', tipo_valor: 'texto', aplica_a: ['area_estudo'] }, PERFIS.curador)).corpo;
    assert.equal((await s.chamar('GET', `/objetos/area_estudo/${propria.id}/atributos`, undefined, PERFIS.leitura)).status, 404);
    const gravou = await s.chamar('PUT', `/objetos/area_estudo/${q.id}/atributos`, { valores: [{ atributo_id: def.id, valor: 320 }, { atributo_id: def2.id, valor: 'ZUOC' }] }, PERFIS.autor);
    assert.equal(gravou.status, 200, gravou.texto);
    assert.equal((await s.chamar('PUT', `/objetos/area_estudo/${q.id}/atributos`, { valores: [{ atributo_id: def.id, valor: 1, versao: 1 }] }, PERFIS.escrita)).corpo.codigo, 'OBJETO_SEM_PERMISSAO');
    assert.equal((await s.chamar('PUT', `/objetos/area_estudo/${propria.id}/atributos`, { valores: [{ atributo_id: def.id, valor: 50 }] }, PERFIS.curador)).status, 200);
    const filtro = await s.chamar('GET', '/estudos?atr_potencial_unidades_min=100', undefined, PERFIS.curador);
    assert.deepEqual(filtro.corpo.dados.map((a: any) => a.id), [q.id]);
    const dist = await s.chamar('GET', `/atributos/${def.id}/distribuicao`, undefined, PERFIS.leitura);
    assert.equal(dist.corpo.n, 1, 'valor da área própria não entra no agregado de quem não a lê');
  } finally {
    await s.fechar();
  }
});

test('CSV de áreas pela tela: atributos atr_, área própria só para curador, estágio de decisão recusado, desfazer', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    await s.chamar('POST', '/atributos', { codigo: 'potencial_unidades', nome: 'Potencial', tipo_valor: 'numero', unidade: 'un', aplica_a: ['area_estudo'] }, PERFIS.curador);
    const csv = gerarCsv(['nome', 'tipo', 'estagio', 'latitude', 'longitude', 'atr_potencial_unidades'], [
      { nome: 'Gleba Sobradinho', tipo: 'prospeccao', estagio: 'hipotese', latitude: -15.65, longitude: -47.79, atr_potencial_unidades: '450' },
      { nome: 'Terreno UP', tipo: 'propria', estagio: 'sinal', latitude: -15.8, longitude: -47.9, atr_potencial_unidades: '' },
      { nome: 'Projeto X', tipo: 'referencia', estagio: 'projeto', latitude: -15.8, longitude: -47.9, atr_potencial_unidades: '' },
    ]);
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'areas_estudo', upload_id: arquivos.subir('areas.csv', csv) }, PERFIS.operador);
    assert.equal(p.status, 201, p.texto);
    assert.equal(p.corpo.rejeitadas, 2, JSON.stringify(p.corpo.rejeicoes));
    const motivos = JSON.stringify(p.corpo.rejeicoes);
    assert.ok(motivos.includes('PAPEL_EXIGIDO') && motivos.includes('DECISAO_PELA_TELA'));
    const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(a.status, 200, a.texto);
    const area = s.dados.linhas('areas_estudo')[0];
    assert.equal(area.nome, 'Gleba Sobradinho');
    assert.equal(area.geometria_tipo, 'Point');
    assert.equal(Number(s.dados.linhas('atributos_valor')[0].valor_num), 450);
    const des = await s.chamar('POST', `/importacoes/${p.corpo.id}/desfazer`, {}, PERFIS.admin);
    assert.equal(des.status, 200, des.texto);
    assert.equal(s.dados.linhas('atributos_valor').length, 0);
    assert.equal((await s.chamar('GET', '/estudos')).corpo.total, 0);

    // O curador importa a área própria.
    const p2 = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'areas_estudo', upload_id: arquivos.subir('areas.csv', csv) }, { ...PERFIS.curador, papeis: ['curador', 'operador'] });
    assert.equal(p2.corpo.rejeitadas, 1, JSON.stringify(p2.corpo.rejeicoes));
  } finally {
    await s.fechar();
  }
});
