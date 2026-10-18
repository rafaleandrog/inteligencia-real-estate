import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { responderErro } from '../backend/rotas/comum';
import { gerarCsv } from '../comum/csv';
import { DadosFalsos, PERFIS, servidor, type PerfilTeste } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';

// Defeitos achados na verificação final antes do primeiro release de teste (#217).

beforeEach(() => esquecerSemente());

const QUADRADO = { type: 'Polygon', coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.7], [-47.9, -15.8]]] };

type Servidor = Awaited<ReturnType<typeof servidor>>;

async function previa(s: Servidor, arquivos: ArquivosFalsos, tabela: string, csv: string, modo = 'ignorar', perfil: PerfilTeste = PERFIS.operador) {
  const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: tabela, modo_duplicata: modo, upload_id: arquivos.subir(`${tabela}.csv`, csv) }, perfil);
  assert.equal(p.status, 201, p.texto);
  return p.corpo;
}

async function aplicar(s: Servidor, id: number, perfil: PerfilTeste = PERFIS.operador) {
  const a = await s.chamar('POST', `/importacoes/${id}/aplicar`, {}, perfil);
  assert.equal(a.status, 200, a.texto);
  return a.corpo;
}

test('PATCH de área: sem mudar o estágio, quem não edita a área não grava aprendizado nem motivo', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const a = (await s.chamar('POST', '/estudos', { nome: 'A', geometria: QUADRADO }, PERFIS.autor)).corpo;
    assert.equal((await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'iniciativa', motivo: 'comitê', versao: 1 }, PERFIS.decisor)).status, 200);
    const r = await s.chamar('PATCH', `/estudos/${a.id}`, { estagio: 'iniciativa', aprendizado: 'X', motivo_encerramento: 'X', versao: 2 }, PERFIS.escrita);
    assert.equal(r.status, 403, r.texto);
    assert.equal(r.corpo.codigo, 'OBJETO_SEM_PERMISSAO');
    assert.equal(s.dados.linhas('areas_estudo')[0].aprendizado ?? null, null);
    assert.equal((await s.chamar('GET', '/estudos?responsavel=abc')).status, 400);
  } finally {
    await s.fechar();
  }
});

test('anúncios: CSV parcial no modo atualizar, casamento pela URL, desfazer e reimportar', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const linhas = aba('listings').slice(0, 2);
    const base = await previa(s, arquivos, 'anuncios', csvDaAba(linhas));
    assert.equal((await aplicar(s, base.id)).inseridas, 2);
    const [primeiro] = s.dados.linhas('anuncios');

    // Só a chave e o preço: a linha atualiza e o resto (status, localidade, coordenadas) fica.
    const parcial = await previa(s, arquivos, 'anuncios', gerarCsv(['listing_id', 'asking_price_brl'], [{ listing_id: primeiro.id_legado, asking_price_brl: '987654' }]), 'atualizar');
    assert.equal(parcial.rejeitadas, 0, JSON.stringify(parcial.rejeicoes));
    assert.equal(parcial.previstas.atualizar, 1);
    assert.equal((await aplicar(s, parcial.id)).atualizadas, 1);
    const depois = s.dados.linhas('anuncios').find((x) => x.id === primeiro.id)!;
    assert.equal(Number(depois.preco_pedido_brl), 987654);
    assert.equal(depois.status, primeiro.status);
    assert.equal(depois.localidade_id, primeiro.localidade_id);
    assert.equal(s.dados.linhas('fontes_portal').filter((f) => f.nome === 'undefined').length, 0);

    // Sem `listing_id`, a mesma URL casa com o existente: nada a inserir.
    const semLegado = linhas.map(({ listing_id: _, ...resto }) => resto);
    const porUrl = await previa(s, arquivos, 'anuncios', csvDaAba(semLegado));
    assert.equal(porUrl.previstas.inserir, 0, JSON.stringify(porUrl.previstas));
    assert.equal(porUrl.previstas.ignorar, 2);

    // Desfazer manda para a lixeira o que ninguém editou (o segundo; o primeiro mudou de preço);
    // o mesmo arquivo entra de novo sem travar no id_legado de quem está na lixeira.
    const des = await s.chamar('POST', `/importacoes/${base.id}/desfazer`, {}, PERFIS.admin);
    assert.equal(des.status, 200, des.texto);
    assert.equal(des.corpo.relatorio_desfazer.removidas.length, 1);
    const de_novo = await previa(s, arquivos, 'anuncios', csvDaAba(linhas));
    const r = await aplicar(s, de_novo.id);
    assert.equal(r.inseridas, 1, JSON.stringify(r.rejeicoes));
    assert.equal(r.ignoradas, 1);
    assert.equal(r.rejeitadas, 0);
  } finally {
    await s.fechar();
  }
});

test('CSV de áreas: atualizar respeita a regra por objeto e a área própria oculta não aparece na prévia', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const alheia = (await s.chamar('POST', '/estudos', { nome: 'Gleba Norte', geometria: QUADRADO }, PERFIS.autor)).corpo;
    assert.equal((await s.chamar('POST', '/estudos', { nome: 'Segredo X', tipo: 'propria', geometria: QUADRADO }, PERFIS.curador)).status, 201);
    const cab = ['nome', 'tipo', 'notas', 'latitude', 'longitude'];

    const upd = await previa(s, arquivos, 'areas_estudo', gerarCsv(cab, [{ nome: 'Gleba Norte', tipo: 'referencia', notas: 'troca', latitude: '', longitude: '' }]), 'atualizar');
    assert.equal(upd.previstas.atualizar, 0);
    assert.equal(upd.rejeicoes[0].codigo, 'OBJETO_SEM_PERMISSAO');
    // Quem pode editar atualiza; estágio e responsável vazios não mudam.
    const meu = await previa(s, arquivos, 'areas_estudo', gerarCsv(['nome', 'notas', 'estagio', 'responsavel_id'], [{ nome: 'Gleba Norte', notas: 'nova nota', estagio: '', responsavel_id: '' }]), 'atualizar', PERFIS.admin);
    assert.equal(meu.previstas.atualizar, 1, JSON.stringify(meu.rejeicoes));
    await aplicar(s, meu.id, PERFIS.admin);
    const area = s.dados.linhas('areas_estudo').find((a) => a.id === alheia.id)!;
    assert.equal(area.notas, 'nova nota');
    assert.equal(area.estagio, 'sinal');
    assert.equal(area.responsavel_id, PERFIS.autor.id);

    const segredo = await previa(s, arquivos, 'areas_estudo', gerarCsv(cab, [{ nome: 'Segredo X', tipo: 'prospeccao', notas: '', latitude: '-15.7', longitude: '-47.8' }]));
    assert.equal(segredo.rejeitadas, 0, JSON.stringify(segredo.rejeicoes));
    assert.equal(segredo.previstas.inserir, 1);
    assert.ok(!JSON.stringify((await s.chamar('GET', `/importacoes/${segredo.id}`, undefined, PERFIS.leitura)).corpo).includes('própria'));

    const semGeo = await previa(s, arquivos, 'areas_estudo', gerarCsv(cab, [{ nome: 'Sem ponto', tipo: 'prospeccao', notas: '', latitude: '', longitude: '' }]));
    assert.equal(semGeo.previstas.inserir, 0);
    assert.equal(semGeo.rejeicoes[0].coluna, 'geometria');
  } finally {
    await s.fechar();
  }
});

test('GeoJSON sem coordenadas vira erro da feição; aplicar duas vezes não duplica', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const geo = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'Quebrada' }, geometry: { type: 'Polygon' } },
        { type: 'Feature', properties: { name: 'Boa' }, geometry: QUADRADO },
      ],
    });
    for (const [rota, perfil] of [['/contornos/importar', PERFIS.curador], ['/estudos/importar', PERFIS.autor]] as const) {
      const p = await s.chamar('POST', rota, { upload_id: arquivos.subir('a.geojson', geo, 'application/geo+json') }, perfil);
      assert.equal(p.status, 201, p.texto);
      assert.equal(p.corpo.feicoes[0].vertices, 0);
      assert.ok(p.corpo.feicoes[0].erros.length);
      const primeira = await s.chamar('POST', `${rota}/${p.corpo.importacao_id}/aplicar`, {}, perfil);
      assert.equal(primeira.status, 200, primeira.texto);
      assert.equal(primeira.corpo.inseridas, 1);
      assert.equal((await s.chamar('POST', `${rota}/${p.corpo.importacao_id}/aplicar`, {}, perfil)).status, 409);
    }
  } finally {
    await s.fechar();
  }
});

test('erros do helper viram 409/422, não 500', () => {
  const resposta = () => {
    const r: any = { headersSent: false, codigo: 0, corpo: null };
    r.status = (c: number) => ((r.codigo = c), r);
    r.json = (b: unknown) => ((r.corpo = b), r);
    return r;
  };
  let proximo: unknown = null;
  const unico = resposta();
  responderErro(Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'anuncios_url_fonte_key' }), unico, (e: unknown) => (proximo = e));
  assert.equal(unico.codigo, 409);
  assert.equal(unico.corpo.codigo, 'DADOS_UNIQUE_VIOLADO');
  const validacao = resposta();
  responderErro(new Error('Erros de validação: anuncios.latitude é obrigatório'), validacao, (e: unknown) => (proximo = e));
  assert.equal(validacao.codigo, 422);
  assert.equal(validacao.corpo.codigo, 'DADOS_VALIDACAO_FALHOU');
  const outro = resposta();
  responderErro(new Error('falha de rede'), outro, (e: unknown) => (proximo = e));
  assert.equal(outro.codigo, 0);
  assert.ok(proximo instanceof Error);
});
