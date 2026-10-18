import { Router, type Request } from 'express';
import { OBJETOS, ehObjetoTipo } from '../../comum/objetos';
import {
  aplicaA, ativosDoObjeto, contarAtivos, converterValor, errosDefinicao, exigirTeto, fonteSegura, normalizarOpcoes,
  objetoAtivo, objetoDaTabelaAtiva, observadoEm, opcoesDe, tabelaDoObjeto, valorDe,
} from '../atributos/catalogo';
import { extensaoAtributos } from '../atributos/importacao';
import { resumo } from '../metricas/estatistica';
import { conflitoVersao, ErroApp, exigirPapel, idDaRota, naoEncontrado, rota, textoQuery, usuarioId } from './comum';
import { criarCadastro, diferenca, editarCadastro, escolher, historico, registrarAlteracao, removerCadastro, restaurarCadastro } from './cadastro-comum';
import { registrarExtensaoAtributos } from './importacoes';
import { atorDe, exigirAcessoArea } from './acesso-objeto';
import { podeLerArea } from '../../comum/regras-objeto';

type Linha = Record<string, any>;

export const atributos: Router = Router();

registrarExtensaoAtributos(extensaoAtributos, async (req, tabela) => {
  const tipo = objetoDaTabelaAtiva(tabela);
  return tipo ? (await ativosDoObjeto(req.dados!, tipo)).map((d) => d.codigo) : [];
});

const CAMPOS_DEF = ['codigo', 'nome', 'descricao', 'tipo_valor', 'unidade', 'opcoes', 'aplica_a', 'grupo', 'ativo'] as const;

async function temValores(req: Request, atributoId: number, filtros: Record<string, unknown> = {}): Promise<boolean> {
  const r = await req.dados!.listar('atributos_valor', { filtros: { atributo_id: atributoId, ...filtros }, por_pagina: 1 });
  return r.dados.length > 0;
}

function emUso(mensagem: string, detalhes?: string[]): ErroApp {
  return new ErroApp(409, 'ATRIBUTO_EM_USO', mensagem, detalhes ?? ['Inative o atributo (ativo = não): os valores ficam para consulta.']);
}

async function codigoLivre(req: Request, codigo: string, id: number | null): Promise<void> {
  const [outro] = await req.dados!.varrerTudo('atributos_def', { filtros: { codigo } });
  if (outro && Number(outro.id) !== id) throw new ErroApp(409, 'DADOS_UNIQUE_VIOLADO', `Já existe o atributo ${codigo}.`);
}

// ---------------------------------------------------------------- catálogo

atributos.get('/atributos', rota(async (req, res) => {
  const removidos = textoQuery(req, 'removidos');
  const ativo = textoQuery(req, 'ativo');
  const filtros: Record<string, unknown> = {};
  if (ativo === 'true' || ativo === 'false') filtros.ativo = ativo === 'true';
  const grupo = textoQuery(req, 'grupo');
  if (grupo) filtros.grupo = grupo;
  let defs = await req.dados!.varrerTudo('atributos_def', {
    filtros, ordenar: 'nome', ordem: 'asc',
    ...(removidos === 'incluir' || removidos === 'apenas' ? { removidos: removidos as 'incluir' | 'apenas' } : {}),
  });
  const alvo = textoQuery(req, 'aplica_a');
  if (alvo) defs = defs.filter((d) => aplicaA(d).includes(alvo));
  res.json({ dados: defs, total: defs.length });
}));

atributos.get('/atributos/:id', rota(async (req, res) => {
  const d = await req.dados!.buscar('atributos_def', idDaRota(req), { incluir_removidos: true });
  if (!d) throw naoEncontrado();
  const valores = await req.dados!.varrerTudo('atributos_valor', { filtros: { atributo_id: d.id } });
  res.json({ ...d, valores_gravados: valores.length });
}));

atributos.get('/atributos/:id/historico', rota(async (req, res) => {
  res.json({ dados: await historico(req, 'atributos_def', idDaRota(req)) });
}));

atributos.post('/atributos', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const d: Linha = escolher(req.body, CAMPOS_DEF);
  d.codigo = typeof d.codigo === 'string' ? d.codigo.trim() : d.codigo;
  d.opcoes = d.tipo_valor === 'opcao' ? normalizarOpcoes(d.opcoes) : null;
  d.ativo = d.ativo !== false;
  const erros = errosDefinicao(d);
  if (erros.length) throw new ErroApp(422, 'ATRIBUTO_DEF_INVALIDA', 'Definição de atributo inválida.', erros);
  await codigoLivre(req, d.codigo, null);
  if (d.ativo) exigirTeto(await contarAtivos(req.dados!));
  const criado = await criarCadastro(req, 'atributos_def', { ...d, versao: 1 });
  res.status(201).json(criado);
}));

/**
 * Edição (spec 6.23): `codigo` e `tipo_valor` não mudam com valor gravado;
 * opções só crescem (a retirada vira `ativo: false`); `aplica_a` só encolhe
 * se o tipo retirado não tiver valor.
 */
atributos.patch('/atributos/:id', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const id = idDaRota(req);
  const atual = await req.dados!.buscar('atributos_def', id);
  if (!atual) throw naoEncontrado();
  const patch: Linha = escolher(req.body, CAMPOS_DEF);
  if (patch.opcoes !== undefined) patch.opcoes = normalizarOpcoes(patch.opcoes);
  if (typeof patch.codigo === 'string') patch.codigo = patch.codigo.trim();
  const final = { ...atual, aplica_a: aplicaA(atual), opcoes: atual.opcoes ? opcoesDe(atual) : null, ...patch };
  const erros = errosDefinicao(final);
  if (erros.length) throw new ErroApp(422, 'ATRIBUTO_DEF_INVALIDA', 'Definição de atributo inválida.', erros);
  const mudaCodigo = patch.codigo !== undefined && patch.codigo !== atual.codigo;
  const mudaTipo = patch.tipo_valor !== undefined && patch.tipo_valor !== atual.tipo_valor;
  if ((mudaCodigo || mudaTipo) && await temValores(req, id)) {
    throw emUso('O atributo já tem valor gravado: código e tipo não mudam.', ['Crie outro atributo e inative este.']);
  }
  if (mudaCodigo) await codigoLivre(req, patch.codigo, id);
  if (patch.opcoes && atual.tipo_valor === 'opcao' && !mudaTipo) {
    const novas = new Set((patch.opcoes as { valor: string }[]).map((o) => o.valor));
    const sumidas = opcoesDe(atual).filter((o) => !novas.has(o.valor)).map((o) => o.valor);
    if (sumidas.length) throw new ErroApp(422, 'ATRIBUTO_DEF_INVALIDA', 'Opção não sai da lista.', sumidas.map((v) => `Mantenha "${v}" com ativo: false, para nenhum valor gravado ficar órfão.`));
  }
  if (patch.aplica_a) {
    const retirados = aplicaA(atual).filter((t) => !(patch.aplica_a as string[]).includes(t));
    for (const t of retirados) {
      if (await temValores(req, id, { objeto_tipo: t })) throw emUso(`Há valores gravados em ${t}: o tipo não sai de aplica_a.`);
    }
  }
  if (patch.ativo === true && !atual.ativo) exigirTeto(await contarAtivos(req.dados!));
  res.json(await editarCadastro(req, 'atributos_def', id, patch));
}));

atributos.patch('/atributos/:id/remover', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const id = idDaRota(req);
  if (await temValores(req, id)) throw emUso('O atributo tem valor gravado e não vai para a lixeira.');
  res.json(await removerCadastro(req, 'atributos_def', id));
}));

atributos.patch('/atributos/:id/restaurar', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  res.json(await restaurarCadastro(req, 'atributos_def', idDaRota(req)));
}));

// ---------------------------------------------------------- valores do objeto

async function objetoExistente(req: Request): Promise<{ tipo: ReturnType<typeof objetoAtivo>; objeto: Linha }> {
  const tipo = objetoAtivo(req.params.tipo);
  const objeto = await req.dados!.buscar(tabelaDoObjeto(tipo), idDaRota(req), { incluir_removidos: true });
  if (!objeto) throw naoEncontrado();
  // Área de estudo: sigilo e regra por objeto (5.16, 14); valor de área própria herda o sigilo.
  if (tipo === 'area_estudo') exigirAcessoArea(req, objeto, 'ler');
  return { tipo, objeto };
}

/** Valores do objeto com a definição, por `grupo` (spec 10.14, bloco Atributos). */
atributos.get('/objetos/:tipo/:id/atributos', rota(async (req, res) => {
  const { tipo, objeto } = await objetoExistente(req);
  const valores = await req.dados!.varrerTudo('atributos_valor', { filtros: { objeto_tipo: tipo, objeto_id: objeto.id } });
  const ativos = await ativosDoObjeto(req.dados!, tipo);
  const ids = new Set(ativos.map((d) => Number(d.id)));
  // Valor de atributo inativo continua visível para consulta (5.24), marcado.
  const extras = valores.filter((v) => !ids.has(Number(v.atributo_id))).map((v) => Number(v.atributo_id));
  const inativos = extras.length ? await req.dados!.varrerTudo('atributos_def', { filtros: { id: extras }, removidos: 'incluir' }) : [];
  const porAtributo = new Map(valores.map((v) => [Number(v.atributo_id), v]));
  const grupos = new Map<string, Linha[]>();
  for (const d of [...ativos, ...inativos]) {
    const v = porAtributo.get(Number(d.id));
    const g = d.grupo ?? '';
    grupos.set(g, [...(grupos.get(g) ?? []), {
      atributo: { id: d.id, codigo: d.codigo, nome: d.nome, descricao: d.descricao ?? null, tipo_valor: d.tipo_valor, unidade: d.unidade ?? null, opcoes: d.opcoes ? opcoesDe(d) : null, ativo: d.ativo, grupo: d.grupo ?? null },
      valor: v ? valorDe(d, v) : null,
      valor_id: v?.id ?? null,
      fonte: v?.fonte ?? null,
      observado_em: v?.observado_em ?? null,
      autor_nome: v?.autor_nome ?? null,
      versao: v ? Number(v.versao) : null,
    }]);
  }
  res.json({
    objeto_tipo: tipo,
    objeto_id: objeto.id,
    removido: !!objeto.removido_em,
    grupos: [...grupos.entries()].map(([grupo, itens]) => ({ grupo: grupo || null, itens })),
  });
}));

/**
 * Grava um lote de valores (spec 6.23): cada um com `atualizarSe` pela versão
 * lida; valor nulo apaga a linha; `alteracoes_cadastro` vai no objeto, com o
 * campo `atr_<codigo>`. Tudo numa transação: um erro desfaz o lote.
 */
atributos.put('/objetos/:tipo/:id/atributos', rota(async (req, res) => {
  const { tipo, objeto } = await objetoExistente(req);
  // Valor: curador; na área de estudo, quem pode escrever na área (6.23).
  if (tipo === 'area_estudo') exigirAcessoArea(req, objeto, 'escrever');
  else exigirPapel(req, 'curador');
  if (objeto.removido_em) throw new ErroApp(404, 'REGISTRO_REMOVIDO', 'O objeto foi removido; restaure-o antes de editar.');
  const lote = Array.isArray(req.body?.valores) ? req.body.valores : null;
  if (!lote || !lote.length) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Envie valores: [{ atributo_id, valor, fonte, observado_em, versao }].');
  const ids = [...new Set(lote.map((v: Linha) => Number(v?.atributo_id)))] as number[];
  const defs = new Map((await req.dados!.varrerTudo('atributos_def', { filtros: { id: ids } })).map((d) => [Number(d.id), d]));
  const erros: string[] = [];
  const preparados: { def: Linha; item: Linha; colunas: Linha | null }[] = [];
  for (const item of lote as Linha[]) {
    const def = defs.get(Number(item?.atributo_id));
    if (!def) { erros.push(`atributo ${item?.atributo_id}: não existe.`); continue; }
    if (!aplicaA(def).includes(tipo)) throw new ErroApp(422, 'ATRIBUTO_NAO_APLICA', `${def.codigo} não se aplica a ${OBJETOS[tipo].rotulo.toLowerCase()}.`);
    const c = converterValor(def, item.valor);
    if (!c.ok) { erros.push(`${def.codigo}: ${c.mensagem}.`); continue; }
    if (c.colunas && !def.ativo) { erros.push(`${def.codigo}: atributo inativo não recebe valor novo.`); continue; }
    preparados.push({ def, item, colunas: c.colunas });
  }
  if (erros.length) throw new ErroApp(422, 'ATRIBUTO_VALOR_INVALIDO', 'Há valores inválidos.', erros);
  const autor = usuarioId(req);
  await req.dados!.transaction(async (trx) => {
    const campos: Record<string, { antes: unknown; depois: unknown }> = {};
    for (const { def, item, colunas } of preparados) {
      const [atual] = await trx.varrerTudo('atributos_valor', { filtros: { objeto_tipo: tipo, objeto_id: objeto.id, atributo_id: def.id } });
      const antes = atual ? valorDe(def, atual) : null;
      if (atual) {
        const versao = Number(item.versao);
        if (!Number.isInteger(versao) || versao !== Number(atual.versao)) throw conflitoVersao();
        if (!colunas) {
          await trx.deletar('atributos_valor', Number(atual.id));
        } else {
          const r = await trx.atualizarSe('atributos_valor', Number(atual.id), {
            ...colunas, fonte: fonteSegura(item.fonte), observado_em: observadoEm(item.observado_em), autor_id: autor, versao: versao + 1,
          }, { versao });
          if (!r) throw conflitoVersao();
        }
      } else if (colunas) {
        await trx.criar('atributos_valor', {
          objeto_tipo: tipo, objeto_id: objeto.id, atributo_id: def.id, ...colunas,
          fonte: fonteSegura(item.fonte), observado_em: observadoEm(item.observado_em), autor_id: autor, versao: 1,
        });
      }
      const depois = colunas ? valorDe(def, colunas) : null;
      Object.assign(campos, diferenca({ [`atr_${def.codigo}`]: antes }, { [`atr_${def.codigo}`]: depois }));
    }
    if (Object.keys(campos).length) await registrarAlteracao(trx, req, tabelaDoObjeto(tipo), Number(objeto.id), 'editado', campos, req.body?.motivo);
  });
  const atualizados = await req.dados!.varrerTudo('atributos_valor', { filtros: { objeto_tipo: tipo, objeto_id: objeto.id } });
  res.json({ objeto_tipo: tipo, objeto_id: objeto.id, gravados: atualizados.length });
}));

/** Distribuição de um atributo numérico no recorte (spec 6.23), com a supressão por n (5.1). */
atributos.get('/atributos/:id/distribuicao', rota(async (req, res) => {
  const def = await req.dados!.buscar('atributos_def', idDaRota(req), { incluir_removidos: true });
  if (!def) throw naoEncontrado();
  if (def.tipo_valor !== 'numero') throw new ErroApp(422, 'ATRIBUTO_NAO_NUMERICO', 'Distribuição só existe para atributo numérico.');
  const pedido = textoQuery(req, 'objeto_tipo');
  const tipos = pedido ? [objetoAtivo(pedido)] : aplicaA(def).filter((t) => ehObjetoTipo(t)).map((t) => t as Parameters<typeof tabelaDoObjeto>[0]).filter((t) => { try { objetoAtivo(t); return true; } catch { return false; } });
  const valores: number[] = [];
  for (const t of tipos) {
    const linhas = await req.dados!.varrerTudo('atributos_valor', { filtros: { atributo_id: def.id, objeto_tipo: t } });
    if (!linhas.length) continue;
    // Objeto removido sai do recorte (5.24): só os vivos contam.
    const ator = atorDe(req);
    const vivos = new Set((await req.dados!.varrerTudo(tabelaDoObjeto(t), { filtros: { id: linhas.map((l) => Number(l.objeto_id)) } }))
      .filter((o) => t !== 'area_estudo' || podeLerArea(ator, o))
      .map((o) => Number(o.id)));
    for (const l of linhas) if (vivos.has(Number(l.objeto_id)) && l.valor_num !== null) valores.push(Number(l.valor_num));
  }
  const r = resumo(valores);
  const amostra = r.n >= 5;
  res.json({
    atributo: { id: def.id, codigo: def.codigo, nome: def.nome, unidade: def.unidade },
    objeto_tipo: pedido ?? null,
    n: r.n,
    minimo: amostra ? Math.min(...valores) : null,
    maximo: amostra ? Math.max(...valores) : null,
    mediana: r.mediana,
    p25: r.p25,
    p75: r.p75,
    indisponivel: amostra ? r.indisponivel : { ...r.indisponivel, minimo: { motivo: 'amostra_pequena', n: r.n, minimo: 5 }, maximo: { motivo: 'amostra_pequena', n: r.n, minimo: 5 } },
  });
}));
