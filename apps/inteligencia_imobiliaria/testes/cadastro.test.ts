import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { rotas, rotasPessoais } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { DadosFalsos, PERFIS, servidor } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

async function importar(s: Awaited<ReturnType<typeof servidor>>, arquivos: ArquivosFalsos, tabela: string, csv: string, modo = 'ignorar') {
  const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: tabela, modo_duplicata: modo, upload_id: arquivos.subir(`${tabela}.csv`, csv) }, PERFIS.operador);
  assert.equal(p.status, 201, p.texto);
  const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
  assert.equal(a.status, 200, a.texto);
  return { previa: p.corpo, aplicada: a.corpo };
}

test('LISTINGS reais: 141 entram, fontes criadas inativas, evento criado e contagem fecha', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const { aplicada } = await importar(s, arquivos, 'anuncios', csvDaAba(aba('listings')));
    assert.equal(aplicada.inseridas, 141, JSON.stringify(aplicada.rejeicoes?.slice(0, 3)));
    assert.equal(aplicada.inseridas + aplicada.atualizadas + aplicada.ignoradas + aplicada.rejeitadas, 141);
    const fontes = s.dados.linhas('fontes_portal');
    assert.deepEqual(fontes.map((f) => f.slug).sort(), ['dfimoveis', 'quintoandar', 'wimoveis']);
    assert.ok(fontes.every((f) => f.ativa === false));
    assert.equal(s.dados.linhas('anuncio_eventos').filter((e) => e.tipo === 'criado').length, 141);
    const a = s.dados.linhas('anuncios')[0];
    assert.equal(a.tipo_transacao, 'venda');
    assert.equal(a.precisao_coordenada, 'centroide_localidade_jitter_deterministico');
    assert.equal(a.origem_cadastro, 'importacao');

    const l = await s.chamar('GET', '/anuncios?localidade=RA_01&tipo_imovel=apartamento&por_pagina=5');
    assert.equal(l.status, 200);
    assert.ok(l.corpo.total > 0);
    assert.ok(l.corpo.dados[0].localidade_nome);
    assert.ok('preco_m2' in l.corpo.dados[0] && 'orientacao' in l.corpo.dados[0]);
    assert.equal(l.corpo.dados[0].orientacao, 'vertical');

    // Ida e volta: o CSV exportado reabre na prévia sem rejeição e sem inserção.
    const csv = await s.chamar('GET', '/anuncios?formato=csv');
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'anuncios', upload_id: arquivos.subir('exp.csv', csv.texto) }, PERFIS.operador);
    assert.equal(p.status, 201, p.texto);
    assert.equal(p.corpo.rejeitadas, 0, JSON.stringify(p.corpo.rejeicoes.slice(0, 3)));
    assert.equal(p.corpo.previstas.inserir, 0);
    assert.equal(p.corpo.previstas.ignorar, 141);
  } finally {
    await s.fechar();
  }
});

test('DEVELOPMENTS e ANCHORS reais entram; meia coordenada fica fora do mapa; grupo e status derivados', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const lanc = await importar(s, arquivos, 'lancamentos', csvDaAba(aba('developments')));
    assert.equal(lanc.aplicada.inseridas + lanc.aplicada.rejeitadas, 22);
    assert.equal(lanc.aplicada.rejeitadas, 0, JSON.stringify(lanc.aplicada.rejeicoes));
    assert.ok(s.dados.linhas('lancamentos').some((l) => l.espacial_utilizavel === false && l.latitude === null));
    const anc = await importar(s, arquivos, 'ancoras', csvDaAba(aba('anchors')));
    assert.equal(anc.aplicada.inseridas, 35, JSON.stringify(anc.aplicada.rejeicoes));
    assert.ok(s.dados.linhas('ancoras').every((a) => a.status === 'ativa'));
    const det = await s.chamar('GET', `/localidades/${s.dados.linhas('ancoras')[0].localidade_id}`);
    assert.ok(det.corpo.contagens.ancoras >= 1);
  } finally {
    await s.fechar();
  }
});

test('curador cria, edita preço, inativa, remove e restaura um anúncio: eventos e alterações registrados', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const fonte = await s.chamar('POST', '/fontes', { nome: 'DF Imóveis', url_base: 'https://www.dfimoveis.com.br' }, PERFIS.operador);
    assert.equal(fonte.status, 201, fonte.texto);
    const ruim = await s.chamar('POST', '/fontes', { nome: 'X', url_base: 'http://127.0.0.1:8080' }, PERFIS.operador);
    assert.equal(ruim.corpo.codigo, 'FONTE_CONFIG_INVALIDA');
    const loc = (await s.chamar('GET', '/localidades?q=Gama')).corpo.dados[0];
    const sem = await s.chamar('POST', '/anuncios', { fonte_id: fonte.corpo.id, tipo_transacao: 'venda', titulo: 'Casa', url_fonte: 'https://www.dfimoveis.com.br/x?utm=1', localidade_id: loc.id, tipo_imovel: 'casa' }, PERFIS.curador);
    assert.equal(sem.status, 422, 'sem coordenada e sem ponto de referência');
    const novo = await s.chamar('POST', '/anuncios', {
      fonte_id: fonte.corpo.id, tipo_transacao: 'venda', titulo: 'Casa 3q', url_fonte: 'https://www.dfimoveis.com.br/x?utm=1', localidade_id: loc.id,
      tipo_imovel: 'casa', latitude: -16.01, longitude: -48.06, preco_pedido_brl: 500000, area_m2: 200, quartos: 3,
    }, PERFIS.curador);
    assert.equal(novo.status, 201, novo.texto);
    assert.equal(novo.corpo.url_fonte, 'https://www.dfimoveis.com.br/x');
    assert.equal(novo.corpo.portal, 'DF Imóveis');
    assert.equal(novo.corpo.preco_m2, 2500);
    assert.equal(novo.corpo.origem_cadastro, 'manual_formulario');
    const id = novo.corpo.id;
    assert.equal((await s.chamar('PATCH', `/anuncios/${id}`, { versao: 1, preco_pedido_brl: 480000 }, PERFIS.leitura)).status, 403);
    const ed = await s.chamar('PATCH', `/anuncios/${id}`, { versao: 1, preco_pedido_brl: 480000 }, PERFIS.curador);
    assert.equal(ed.status, 200, ed.texto);
    assert.ok(ed.corpo.preco_alterado_em);
    await s.chamar('PATCH', `/anuncios/${id}`, { versao: 2, status: 'inativo' }, PERFIS.curador);
    await s.chamar('PATCH', `/anuncios/${id}/remover`, {}, PERFIS.curador);
    assert.equal((await s.chamar('GET', '/anuncios?status=todos')).corpo.total, 0);
    assert.equal((await s.chamar('GET', '/anuncios?status=todos&removidos=apenas')).corpo.total, 1);
    await s.chamar('PATCH', `/anuncios/${id}/restaurar`, {}, PERFIS.curador);
    const ev = await s.chamar('GET', `/anuncios/${id}/eventos`);
    assert.deepEqual(ev.corpo.dados.map((e: any) => e.tipo).reverse(), ['criado', 'preco_alterado', 'inativo_confirmado', 'removido', 'restaurado']);
    const hist = await s.chamar('GET', `/anuncios/${id}/historico`);
    assert.deepEqual(hist.corpo.dados.map((h: any) => h.acao).reverse(), ['criado', 'editado', 'editado', 'removido', 'restaurado']);
    const ficha = await s.chamar('GET', `/anuncios/${id}`);
    assert.equal(ficha.corpo.retratos, null);
    assert.deepEqual(ficha.corpo.indisponivel.retratos, { motivo: 'fase_futura', fase: '3' });
  } finally {
    await s.fechar();
  }
});

test('lançamento e âncora: criar, validar e derivar', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const l = await s.chamar('POST', '/lancamentos', { nome: 'Res. X', bairro_texto: 'Noroeste', status: 'lançamento / em obras', obra_frac: 0.4 }, PERFIS.curador);
    assert.equal(l.status, 201, l.texto);
    assert.equal(l.corpo.estagio_vendas, 'em_lancamento');
    assert.equal(l.corpo.espacial_utilizavel, false);
    const ruim = await s.chamar('POST', '/lancamentos', { nome: 'Y', bairro_texto: 'Z', obra_frac: 40 }, PERFIS.curador);
    assert.equal(ruim.status, 422);
    const a = await s.chamar('POST', '/ancoras', { nome: 'Shopping', categoria: 'shopping_center', subcategoria: 'regional', operador: 'Op', latitude: -15.8, longitude: -47.9, url_fonte: 'https://x.br' }, PERFIS.curador);
    assert.equal(a.status, 201, a.texto);
    assert.equal(a.corpo.grupo, 'comercio_servico');
    assert.equal((await s.chamar('GET', '/ancoras?categoria=shopping_center,escola')).corpo.total, 1);
  } finally {
    await s.fechar();
  }
});

test('rota pessoal de uso: leitura grava a abertura de tela', async () => {
  const app = express.Router();
  app.use('/pessoal', rotasPessoais);
  const s = await servidor(app, new DadosFalsos());
  try {
    const r = await s.chamar('POST', '/pessoal/uso', { sub_rota: '/mapa?x=1', acao: 'abrir' }, { ...PERFIS.leitura, nivel: 'escrita' });
    assert.equal(r.status, 204, r.texto);
    assert.equal(s.dados.linhas('uso_eventos')[0].sub_rota, '/mapa');
  } finally {
    await s.fechar();
  }
});
