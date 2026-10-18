import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { rotas } from '../backend/rotas';
import { esquecerSemente } from '../backend/semente';
import { OBJETOS_ATIVOS } from '../backend/atributos/catalogo';
import { OBJETOS, OBJETO_TIPOS } from '../comum/objetos';
import { CACHE_NUCLEO_MS, criarClienteNucleo, POR_PAGINA_NUCLEO } from '../comum/nucleo-cliente';
import { DadosFalsos, PERFIS, RAIZ_APP, servidor } from './infra';
import { ArquivosFalsos, aba, csvDaAba } from './arquivos-falsos';

beforeEach(() => esquecerSemente());

const QUADRADO = { type: 'Polygon', coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.7], [-47.9, -15.8]]] };

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivosTs(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// ------------------------------------------------------------ cliente do núcleo

/** Núcleo simulado: `total` lotes, registra cada caminho chamado. */
function nucleoSimulado(total: number, opcoes: { ignoraFiltro?: boolean; erro?: { status: number; codigo: string } } = {}) {
  const chamadas: string[] = [];
  const lotes = Array.from({ length: total }, (_, i) => ({ id: i + 1, parcelamento_id: (i % 3) + 1, quadra: String(i % 7), id_legivel: `QD ${i % 7} LT ${i + 1}` }));
  const chamar = async (caminho: string) => {
    chamadas.push(caminho);
    if (opcoes.erro) throw Object.assign(new Error('flag'), opcoes.erro);
    const [rota, qs] = caminho.split('?');
    const q = new URLSearchParams(qs ?? '');
    if (/^\/lotes\/\d+$/.test(rota)) {
      const l = lotes.find((x) => x.id === Number(rota.split('/')[2]));
      if (!l) throw Object.assign(new Error('nao'), { status: 404, codigo: 'NAO_ENCONTRADO' });
      return l;
    }
    let base: any[] = rota === '/matriculas' ? [{ id: 9, numero: 4808, cri: 2, uf: 'DF', confiabilidade: 'alta', id_legivel: 'Mat. 4808 — 2° CRI/DF' }] : lotes;
    const pid = q.get('parcelamento_id');
    if (pid && !opcoes.ignoraFiltro) base = base.filter((l) => String(l.parcelamento_id) === pid);
    const pagina = Number(q.get('pagina'));
    const pp = Number(q.get('por_pagina'));
    return { dados: base.slice((pagina - 1) * pp, pagina * pp), total: base.length, pagina, por_pagina: pp };
  };
  return { chamadas, chamar };
}

test('cliente do núcleo: pagina em 200 até a página incompleta; cache de 60 s não repete a chamada', async () => {
  const n = nucleoSimulado(450);
  let agora = 0;
  const c = criarClienteNucleo(n.chamar, () => agora);
  const r = await c.listar('lotes');
  assert.equal(r.linhas.length, 450);
  assert.equal(n.chamadas.length, 3);
  assert.ok(n.chamadas.every((p) => p.includes(`por_pagina=${POR_PAGINA_NUCLEO}`)));
  agora += CACHE_NUCLEO_MS - 1;
  await c.listar('lotes');
  assert.equal(n.chamadas.length, 3, 'segunda abertura em menos de 60 s não faz requisição');
  agora += 2;
  await c.listar('lotes');
  assert.equal(n.chamadas.length, 6);
});

test('cliente do núcleo: teto de 50 páginas vira "lista grande demais", nunca parcial', async () => {
  const n = nucleoSimulado(200 * 51);
  const r = await criarClienteNucleo(n.chamar).listar('lotes');
  assert.equal(r.grande_demais, true);
  assert.equal(r.linhas.length, 0);
  assert.equal(n.chamadas.length, 50);
});

test('cliente do núcleo: filtro fora da allowlist não sai; filtro ignorado pelo núcleo é detectado e descartado', async () => {
  const n = nucleoSimulado(30);
  const c = criarClienteNucleo(n.chamar);
  const r = await c.listar('lotes', { parcelamento_id: 2, quadra: '3' });
  assert.ok(n.chamadas[0].includes('parcelamento_id=2'));
  assert.ok(!n.chamadas[0].includes('quadra'), 'quadra não está em FILTROS_ACEITOS');
  assert.deepEqual(r.filtrado_no_cliente, ['quadra']);
  assert.ok(r.linhas.length > 0 && r.linhas.every((l) => l.parcelamento_id === 2 && l.quadra === '3'));
  assert.equal(r.filtro_ignorado, false);

  const ignora = nucleoSimulado(30, { ignoraFiltro: true });
  const r2 = await criarClienteNucleo(ignora.chamar).listar('lotes', { parcelamento_id: 2 });
  assert.equal(r2.filtro_ignorado, true);
  assert.ok(r2.linhas.every((l) => l.parcelamento_id === 2));
});

test('cliente do núcleo: 403 de flag vira sem_permissao com a mensagem do banner; 404 vira nao_encontrado', async () => {
  for (const codigo of ['NUCLEO_FLAG_DESLIGADA', 'NUCLEO_FLAG_NAO_PEDIDA']) {
    const c = criarClienteNucleo(nucleoSimulado(5, { erro: { status: 403, codigo } }).chamar);
    const l = await c.listar('lotes');
    assert.equal(l.erro?.estado, 'sem_permissao');
    assert.match(l.erro!.mensagem, /aba Núcleo/);
    assert.equal((await c.ler('lotes', 1)).estado, 'sem_permissao');
  }
  const c = criarClienteNucleo(nucleoSimulado(5).chamar);
  assert.equal((await c.ler('lotes', 99)).estado, 'nao_encontrado');
  assert.equal((await c.ler('lotes', 2)).registro?.id, 2);
});

test('cliente do núcleo: matrícula só pela listagem; nunca /pessoas, detalhe de matrícula, transações ou bbox', async () => {
  const n = nucleoSimulado(3);
  const c = criarClienteNucleo(n.chamar);
  const m = await c.ler('matriculas', 9);
  assert.equal(m.registro?.confiabilidade, 'alta');
  assert.ok(n.chamadas.every((p) => p.startsWith('/matriculas?')));
  await assert.rejects(() => c.listar('pessoas'));
  await assert.rejects(() => c.listar('transacoes'));
  for (const p of n.chamadas) assert.ok(!/\/pessoas|transacoes|bbox|\/matriculas\/\d/.test(p), p);
});

test('só comum/nucleo-cliente.ts chama urbiVerso.modulo (D-140)', () => {
  const chamam = [...arquivosTs(join(RAIZ_APP, 'frontend')), ...arquivosTs(join(RAIZ_APP, 'comum')), ...arquivosTs(join(RAIZ_APP, 'backend'))]
    .filter((f) => /\.modulo\(\s*['"]/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(RAIZ_APP, f));
  assert.deepEqual(chamam, ['comum/nucleo-cliente.ts']);
  for (const f of arquivosTs(join(RAIZ_APP, 'frontend'))) {
    assert.ok(!/imobiliario-[a-z]/.test(readFileSync(f, 'utf8')), `${f} usa componente imobiliario-*`);
  }
});

test('manifesto declara o imobiliário com ler nas entidades; objetos ativos casam com o schema', () => {
  const m = JSON.parse(readFileSync(join(RAIZ_APP, 'manifesto.json'), 'utf8'));
  const dep = m.dependencias['urbiverso/modulos-urbiverso::imobiliario'];
  assert.equal(dep.versao_min, '1.0.0');
  for (const e of ['imoveis', 'parcelamentos', 'incorporacoes', 'matriculas', 'setores_habitacionais']) assert.deepEqual(dep.entidades[e], ['ler']);
  const schema = JSON.parse(readFileSync(join(RAIZ_APP, 'schema.json'), 'utf8'));
  for (const t of OBJETO_TIPOS) assert.equal(OBJETOS_ATIVOS.has(t), Boolean(schema.tabelas[OBJETOS[t].tabela]), t);
});

// ------------------------------------------------------------------ vínculos

/** `req.modulos.imobiliario` simulado: só `buscarPorChave` por id. */
function modulosFalsos(vivos: Record<string, number[]>, erro?: { status: number; codigo: string }) {
  const pedidos: { tabela: string; chave: string[]; valores: any[] }[] = [];
  return {
    pedidos,
    modulos: {
      imobiliario: {
        async buscarPorChave(tabela: string, chave: string[], valores: any[]) {
          pedidos.push({ tabela, chave, valores });
          if (erro) throw Object.assign(new Error('flag desligada'), erro);
          const achados = new Map<string, any>();
          for (const v of valores) if ((vivos[tabela] ?? []).includes(Number(v.id))) achados.set(String(v.id), { id: Number(v.id) });
          return { achados };
        },
      },
    },
  };
}

test('vínculo: combinação conferida, id conferido por buscarPorChave, histórico e desfazer', async () => {
  const f = modulosFalsos({ lotes: [100], parcelamentos: [7] });
  const s = await servidor(rotas, new DadosFalsos(), { modulos: f.modulos });
  try {
    const c = (await s.chamar('POST', '/contornos', { nome: 'Polígono 12 do Magis', geometria: QUADRADO }, PERFIS.curador)).corpo;
    const base = { objeto_tipo: 'contorno', objeto_id: c.id };
    assert.equal((await s.chamar('POST', '/vinculos-nucleo', { ...base, entidade: 'imoveis', nucleo_subtipo: 'lote', nucleo_id: 100 }, PERFIS.escrita)).corpo.codigo, 'PAPEL_EXIGIDO');
    assert.equal((await s.chamar('POST', '/vinculos-nucleo', { ...base, entidade: 'matriculas', nucleo_id: 1 }, PERFIS.curador)).corpo.codigo, 'VINCULO_NAO_PERMITIDO');
    assert.equal((await s.chamar('POST', '/vinculos-nucleo', { ...base, entidade: 'imoveis', nucleo_id: 100 }, PERFIS.curador)).corpo.codigo, 'VINCULO_NAO_PERMITIDO');
    assert.equal((await s.chamar('POST', '/vinculos-nucleo', { objeto_tipo: 'anuncio', objeto_id: 1, entidade: 'imoveis', nucleo_subtipo: 'lote', nucleo_id: 100 }, PERFIS.curador)).corpo.codigo, 'VINCULO_NAO_PERMITIDO');
    const inexistente = await s.chamar('POST', '/vinculos-nucleo', { ...base, entidade: 'imoveis', nucleo_subtipo: 'lote', nucleo_id: 999 }, PERFIS.curador);
    assert.equal(inexistente.status, 422);
    assert.equal(inexistente.corpo.codigo, 'VINCULO_NUCLEO_INEXISTENTE');
    const ok = await s.chamar('POST', '/vinculos-nucleo', { ...base, entidade: 'imoveis', nucleo_subtipo: 'lote', nucleo_id: 100, notas: 'polígono 12 = lote 3 da quadra 5' }, PERFIS.curador);
    assert.equal(ok.status, 201, ok.texto);
    assert.deepEqual(f.pedidos.at(-1), { tabela: 'lotes', chave: ['id'], valores: [{ id: 100 }] });
    assert.equal((await s.chamar('POST', '/vinculos-nucleo', { ...base, entidade: 'imoveis', nucleo_subtipo: 'lote', nucleo_id: 100 }, PERFIS.curador)).status, 409);
    assert.equal((await s.chamar('POST', '/vinculos-nucleo', { ...base, entidade: 'parcelamentos', nucleo_id: 7 }, PERFIS.curador)).status, 201);
    const lista = await s.chamar('GET', `/vinculos-nucleo?objeto_tipo=contorno&objeto_id=${c.id}`, undefined, PERFIS.leitura);
    assert.equal(lista.corpo.dados.length, 2);
    const mapa = await s.chamar('GET', '/vinculos-nucleo/mapa', undefined, PERFIS.leitura);
    assert.equal(mapa.corpo.features.length, 1);
    assert.equal(mapa.corpo.features[0].properties.vinculos.length, 2);
    // Nada do núcleo é copiado: o vínculo só guarda o id.
    assert.deepEqual(Object.keys(s.dados.linhas('vinculos_nucleo')[0]).filter((k) => /area|quadra|id_legivel|matricula/.test(k)), []);
    const rem = await s.chamar('PATCH', `/vinculos-nucleo/${ok.corpo.id}/remover`, {}, PERFIS.curador);
    assert.ok(rem.corpo.removido_em);
    assert.equal((await s.chamar('GET', `/vinculos-nucleo/${ok.corpo.id}/historico`)).corpo.dados.length, 2);
    assert.equal((await s.chamar('PATCH', `/vinculos-nucleo/${ok.corpo.id}/restaurar`, {}, PERFIS.curador)).status, 200);
  } finally {
    await s.fechar();
  }
});

test('vínculo: flag desligada sai como 403 do contrato; sem o módulo, 503', async () => {
  const f = modulosFalsos({}, { status: 403, codigo: 'NUCLEO_FLAG_DESLIGADA' });
  const s = await servidor(rotas, new DadosFalsos(), { modulos: f.modulos });
  const s2 = await servidor(rotas, new DadosFalsos());
  try {
    const c = (await s.chamar('POST', '/contornos', { nome: 'A', geometria: QUADRADO }, PERFIS.curador)).corpo;
    const r = await s.chamar('POST', '/vinculos-nucleo', { objeto_tipo: 'contorno', objeto_id: c.id, entidade: 'parcelamentos', nucleo_id: 1 }, PERFIS.curador);
    assert.equal(r.status, 403);
    assert.equal(r.corpo.codigo, 'NUCLEO_FLAG_DESLIGADA');
    const c2 = (await s2.chamar('POST', '/contornos', { nome: 'A', geometria: QUADRADO }, PERFIS.curador)).corpo;
    assert.equal((await s2.chamar('POST', '/vinculos-nucleo', { objeto_tipo: 'contorno', objeto_id: c2.id, entidade: 'parcelamentos', nucleo_id: 1 }, PERFIS.curador)).status, 503);
  } finally {
    await s.fechar();
    await s2.fechar();
  }
});

// ----------------------------------------------------------------- atributos

async function contornos(s: Awaited<ReturnType<typeof servidor>>, n: number): Promise<any[]> {
  const out = [];
  for (let i = 0; i < n; i++) out.push((await s.chamar('POST', '/contornos', { nome: `C${i}`, geometria: QUADRADO }, PERFIS.curador)).corpo);
  return out;
}

test('atributo numérico para contorno: valores em três, filtro por faixa, distribuição com supressão, em uso', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const invalido = await s.chamar('POST', '/atributos', { codigo: 'Taxa', nome: 'Taxa', tipo_valor: 'numero', aplica_a: [] }, PERFIS.curador);
    assert.equal(invalido.corpo.codigo, 'ATRIBUTO_DEF_INVALIDA');
    assert.ok(invalido.corpo.detalhes.length >= 3);
    assert.equal((await s.chamar('POST', '/atributos', { codigo: 'x', nome: 'X', tipo_valor: 'texto', aplica_a: ['contorno'] }, PERFIS.operador)).corpo.codigo, 'PAPEL_EXIGIDO');
    const def = await s.chamar('POST', '/atributos', { codigo: 'taxa_ocupacao', nome: 'Taxa de ocupação', tipo_valor: 'numero', unidade: 'frac', aplica_a: ['contorno'], grupo: 'urbanistico' }, PERFIS.admin);
    assert.equal(def.status, 201, def.texto);
    const [a, b, c, d] = await contornos(s, 4);
    for (const [obj, v] of [[a, 0.3], [b, 0.5], [c, 0.7]] as const) {
      const r = await s.chamar('PUT', `/objetos/contorno/${obj.id}/atributos`, { valores: [{ atributo_id: def.corpo.id, valor: v, fonte: 'PDOT 2012' }] }, PERFIS.curador);
      assert.equal(r.status, 200, r.texto);
    }
    assert.equal((await s.chamar('PUT', `/objetos/contorno/${d.id}/atributos`, { valores: [{ atributo_id: def.corpo.id, valor: 'muito' }] }, PERFIS.curador)).corpo.codigo, 'ATRIBUTO_VALOR_INVALIDO');
    assert.equal((await s.chamar('PUT', `/objetos/contorno/${d.id}/atributos`, { valores: [{ atributo_id: def.corpo.id, valor: 12 }] }, PERFIS.curador)).corpo.codigo, 'ATRIBUTO_VALOR_INVALIDO');
    assert.equal((await s.chamar('PUT', `/objetos/anuncio/1/atributos`, { valores: [{ atributo_id: def.corpo.id, valor: 0.1 }] }, PERFIS.curador)).status, 404);

    const ficha = await s.chamar('GET', `/objetos/contorno/${b.id}/atributos`, undefined, PERFIS.leitura);
    const item = ficha.corpo.grupos[0].itens[0];
    assert.equal(ficha.corpo.grupos[0].grupo, 'urbanistico');
    assert.equal(item.valor, 0.5);
    assert.equal(item.fonte, 'PDOT 2012');
    // Versão velha não sobrescreve; nulo apaga; o histórico do objeto registra o atributo.
    assert.equal((await s.chamar('PUT', `/objetos/contorno/${b.id}/atributos`, { valores: [{ atributo_id: def.corpo.id, valor: 0.6, versao: 9 }] }, PERFIS.curador)).corpo.codigo, 'CONFLITO_VERSAO');
    assert.equal((await s.chamar('PUT', `/objetos/contorno/${b.id}/atributos`, { valores: [{ atributo_id: def.corpo.id, valor: 0.55, versao: item.versao }] }, PERFIS.curador)).status, 200);
    const hist = await s.chamar('GET', `/contornos/${b.id}/historico`);
    assert.ok(hist.corpo.dados.some((h: any) => h.campos?.atr_taxa_ocupacao?.depois === 0.55));

    const faixa = await s.chamar('GET', '/contornos?formato=lista&atr_taxa_ocupacao_min=0.4&atr_taxa_ocupacao_max=0.8', undefined, PERFIS.leitura);
    assert.deepEqual(faixa.corpo.dados.map((x: any) => x.id).sort(), [b.id, c.id].sort());
    assert.equal((await s.chamar('GET', '/contornos?formato=lista&atr_nao_existe_min=1')).corpo.codigo, 'METRICA_DESCONHECIDA');
    const csv = await s.chamar('GET', '/contornos?formato=csv');
    assert.ok(csv.texto.split('\n')[0].includes('atr_taxa_ocupacao'));

    const dist = await s.chamar('GET', `/atributos/${def.corpo.id}/distribuicao?objeto_tipo=contorno`, undefined, PERFIS.leitura);
    assert.equal(dist.corpo.n, 3);
    assert.equal(dist.corpo.mediana, null);
    assert.equal(dist.corpo.indisponivel.mediana.motivo, 'amostra_pequena');
    assert.equal(dist.corpo.minimo, null);

    // Com valor gravado: código e tipo não mudam, não vai à lixeira, não sai de aplica_a; inativar pode.
    const atual = (await s.chamar('GET', `/atributos/${def.corpo.id}`)).corpo;
    assert.equal(atual.valores_gravados, 3);
    assert.equal((await s.chamar('PATCH', `/atributos/${def.corpo.id}`, { versao: atual.versao, codigo: 'outro' }, PERFIS.curador)).corpo.codigo, 'ATRIBUTO_EM_USO');
    assert.equal((await s.chamar('PATCH', `/atributos/${def.corpo.id}`, { versao: atual.versao, aplica_a: ['anuncio'] }, PERFIS.curador)).corpo.codigo, 'ATRIBUTO_EM_USO');
    assert.equal((await s.chamar('PATCH', `/atributos/${def.corpo.id}/remover`, {}, PERFIS.curador)).corpo.codigo, 'ATRIBUTO_EM_USO');
    const inativo = await s.chamar('PATCH', `/atributos/${def.corpo.id}`, { versao: atual.versao, ativo: false }, PERFIS.curador);
    assert.equal(inativo.corpo.ativo, false);
    assert.equal((await s.chamar('GET', '/contornos?formato=lista&atr_taxa_ocupacao_min=0')).corpo.codigo, 'METRICA_DESCONHECIDA');
    const consulta = await s.chamar('GET', `/objetos/contorno/${a.id}/atributos`);
    assert.equal(consulta.corpo.grupos[0].itens[0].valor, 0.3, 'valor de atributo inativo fica para consulta');
  } finally {
    await s.fechar();
  }
});

test('atributo de opção: opções só crescem; aplica_a e filtro por igualdade', async () => {
  const s = await servidor(rotas, new DadosFalsos());
  try {
    const def = (await s.chamar('POST', '/atributos', { codigo: 'zoneamento', nome: 'Zoneamento', tipo_valor: 'opcao', opcoes: [{ valor: 'zeis', rotulo: 'ZEIS' }, { valor: 'zuc', rotulo: 'ZUC' }], aplica_a: ['contorno'] }, PERFIS.curador)).corpo;
    assert.ok(def.id);
    const [a, b] = await contornos(s, 2);
    await s.chamar('PUT', `/objetos/contorno/${a.id}/atributos`, { valores: [{ atributo_id: def.id, valor: 'ZEIS' }] }, PERFIS.curador);
    await s.chamar('PUT', `/objetos/contorno/${b.id}/atributos`, { valores: [{ atributo_id: def.id, valor: 'zuc' }] }, PERFIS.curador);
    const r = await s.chamar('GET', '/contornos?formato=lista&atr_zoneamento=zeis');
    assert.deepEqual(r.corpo.dados.map((x: any) => x.id), [a.id]);
    const sumiu = await s.chamar('PATCH', `/atributos/${def.id}`, { versao: def.versao, opcoes: [{ valor: 'zeis', rotulo: 'ZEIS' }] }, PERFIS.curador);
    assert.equal(sumiu.corpo.codigo, 'ATRIBUTO_DEF_INVALIDA');
    const retirada = await s.chamar('PATCH', `/atributos/${def.id}`, { versao: def.versao, opcoes: [{ valor: 'zeis', rotulo: 'ZEIS' }, { valor: 'zuc', rotulo: 'ZUC', ativo: false }, { valor: 'zr', rotulo: 'ZR' }] }, PERFIS.curador);
    assert.equal(retirada.status, 200, retirada.texto);
    assert.equal((await s.chamar('PUT', `/objetos/contorno/${a.id}/atributos`, { valores: [{ atributo_id: def.id, valor: 'zuc', versao: 1 }] }, PERFIS.curador)).corpo.codigo, 'ATRIBUTO_VALOR_INVALIDO');
    const lanc = await s.chamar('PUT', `/objetos/lancamento/1/atributos`, { valores: [{ atributo_id: def.id, valor: 'zeis' }] }, PERFIS.curador);
    assert.equal(lanc.status, 404);
  } finally {
    await s.fechar();
  }
});

test('CSV com atr_<codigo>: prévia confere, valor grava com importacao_id e o desfazer o alcança', async () => {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  try {
    const def = (await s.chamar('POST', '/atributos', { codigo: 'gabarito', nome: 'Gabarito', tipo_valor: 'numero', unidade: 'un', aplica_a: ['ancora'] }, PERFIS.curador)).corpo;
    const modelo = await s.chamar('GET', '/importacoes/modelo/ancoras', undefined, PERFIS.operador);
    assert.ok(modelo.texto.includes('atr_gabarito'));
    const linhas = aba('anchors').slice(0, 3).map((l, i) => ({ ...l, atr_gabarito: ['3', 'alto', ''][i], atr_inventado: 'x' }));
    const csv = csvDaAba(linhas);
    const p = await s.chamar('POST', '/importacoes/previa', { tabela_alvo: 'ancoras', upload_id: arquivos.subir('a.csv', csv) }, PERFIS.operador);
    assert.equal(p.status, 201, p.texto);
    assert.ok(p.corpo.colunas_ignoradas.some((c: any) => c.cabecalho === 'atr_inventado' && c.motivo === 'desconhecida'));
    assert.equal(p.corpo.rejeitadas, 1, JSON.stringify(p.corpo.rejeicoes));
    assert.ok(JSON.stringify(p.corpo.rejeicoes).includes('atr_gabarito'));
    const a = await s.chamar('POST', `/importacoes/${p.corpo.id}/aplicar`, {}, PERFIS.operador);
    assert.equal(a.status, 200, a.texto);
    const valores = s.dados.linhas('atributos_valor');
    assert.equal(valores.length, 1);
    assert.equal(Number(valores[0].valor_num), 3);
    assert.equal(valores[0].importacao_id, p.corpo.id);
    assert.equal(valores[0].atributo_id, def.id);
    const des = await s.chamar('POST', `/importacoes/${p.corpo.id}/desfazer`, {}, PERFIS.admin);
    assert.equal(des.status, 200, des.texto);
    assert.equal(s.dados.linhas('atributos_valor').length, 0);
  } finally {
    await s.fechar();
  }
});
