import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DadosFalsos } from './infra';

// Contrato do req.dados falso: a semântica que as rotas da app assumem do framework (banco-de-dados.md).
const schema = {
  tabelas: {
    itens: {
      soft_delete: true,
      colunas: {
        nome: { tipo: 'texto', limite: 20, obrigatorio: true },
        codigo: { tipo: 'texto', limite: 10 },
        status: { tipo: 'texto', limite: 10, opcoes: ['ativo', 'inativo'] },
        valor: { tipo: 'decimal', precisao: 10, escala: 2 },
        versao: { tipo: 'inteiro', padrao: 1 },
        pai_id: { tipo: 'referencia', tabela_ref: 'pais' },
      },
      unicos: [{ colunas: ['codigo'], onde: [{ coluna: 'removido_em', operador: 'nulo' }] }],
    },
    pais: { colunas: { nome: { tipo: 'texto', limite: 20 } } },
  },
};

test('criar aplica padrão, automáticas e valida obrigatório, opções e referência', async () => {
  const d = new DadosFalsos(schema);
  const a = await d.criar('itens', { nome: 'A', status: 'ativo' });
  assert.equal(a.id, 1);
  assert.equal(a.versao, 1);
  assert.equal(a.removido_em, null);
  assert.ok(a.criado_em instanceof Date);
  await assert.rejects(d.criar('itens', { status: 'ativo' }), /obrigatório/);
  await assert.rejects(d.criar('itens', { nome: 'B', status: 'outro' }), /opções/);
  await assert.rejects(d.criar('itens', { nome: 'B', pai_id: 99 }), /Referência inválida/);
  await assert.rejects(d.criar('itens', { nome: 'B', inexistente: 1 }), /Coluna inexistente/);
});

test('não encontrado devolve null; atualizar alcança removido e buscar não', async () => {
  const d = new DadosFalsos(schema);
  assert.equal(await d.buscar('itens', 9), null);
  assert.equal(await d.atualizar('itens', 9, { nome: 'x' }), null);
  const a = await d.criar('itens', { nome: 'A' });
  await d.remover('itens', a.id, 5);
  assert.equal(await d.buscar('itens', a.id), null);
  assert.ok(await d.buscar('itens', a.id, { incluir_removidos: true }));
  const at = await d.atualizar('itens', a.id, { nome: 'B' });
  assert.equal(at?.nome, 'B');
  assert.ok(at?.removido_em);
  assert.equal(await d.atualizarSe('itens', a.id, { nome: 'C' }, { versao: 1 }), null);
});

test('único parcial ignora removidos; restaurar confere colisão', async () => {
  const d = new DadosFalsos(schema);
  const a = await d.criar('itens', { nome: 'A', codigo: 'X' });
  await assert.rejects(d.criar('itens', { nome: 'B', codigo: 'X' }), /único/);
  await d.remover('itens', a.id);
  const b = await d.criar('itens', { nome: 'B', codigo: 'X' });
  assert.equal(b.id, 2);
  await assert.rejects(d.restaurar('itens', a.id), /único/);
});

test('filtros: vírgula vira IN, operadores, busca sem acento, nulo, ordenação e paginação', async () => {
  const d = new DadosFalsos(schema);
  for (const [nome, valor] of [['São Paulo', 10], ['Brasília', 20], ['Goiânia', 30]] as const) await d.criar('itens', { nome, valor });
  assert.equal((await d.listar('itens', { filtros: { nome: 'Brasília,Goiânia' } })).total, 2);
  assert.equal((await d.listar('itens', { filtros: { 'valor[gte]': 20 } })).total, 2);
  assert.equal((await d.listar('itens', { filtros: { 'nome[busca]': 'sao' } })).total, 1);
  assert.equal((await d.listar('itens', { filtros: { 'codigo[nulo]': 'true' } })).total, 3);
  const ord = await d.listar('itens', { ordenar: 'valor', ordem: 'desc', por_pagina: 2, pagina: 1 });
  assert.deepEqual(ord.dados.map((l) => l.nome), ['Goiânia', 'Brasília']);
  assert.equal(ord.paginas, 2);
  assert.equal((await d.varrerTudo('itens')).length, 3);
});

test('transaction faz rollback em exceção e propaga o retorno', async () => {
  const d = new DadosFalsos(schema);
  await d.criar('itens', { nome: 'A' });
  await assert.rejects(
    d.transaction(async (trx) => {
      await trx.criar('itens', { nome: 'B' });
      throw new Error('falha');
    }),
    /falha/,
  );
  assert.equal(d.linhas('itens').length, 1);
  const r = await d.transaction(async (trx) => (await trx.criar('itens', { nome: 'C' })).id);
  assert.equal(r, 2);
});
