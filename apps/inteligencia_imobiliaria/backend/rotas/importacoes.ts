import { Router, type Request } from 'express';
import { gerarCsv } from '../../comum/csv';
import { cabecalhoModelo, TABELAS_IMPORT, type ModoDuplicata } from '../../comum/importacao-chaves';
import { aplicarValidacao, desfazerImportacao, lerArquivoTexto, MAX_REJEICOES_RELATORIO, MAX_REJEICOES_RESPOSTA, validarCsv, type ExtensaoAtributos } from '../importacao/motor';
import { GANCHOS, type CtxImportacao } from '../importacao/tabelas';
import { ErroApp, exigirPapel, idDaRota, naoEncontrado, paginacao, rota, temPapel, textoQuery, usuarioId } from './comum';
import { cidadeDoRequest } from './territorio-comum';

export const importacoes: Router = Router();

/** Extensão de atributos `atr_<codigo>` (registrada pela camada de atributos, 15.1a). */
let extensaoAtributos: ExtensaoAtributos | undefined;
/** Códigos `atr_<codigo>` do modelo baixável (atributos ativos que se aplicam à tabela). */
let atributosDoModelo: ((req: Request, tabela: string) => Promise<string[]>) | undefined;
export function registrarExtensaoAtributos(e: ExtensaoAtributos, modelo?: (req: Request, tabela: string) => Promise<string[]>): void {
  extensaoAtributos = e;
  atributosDoModelo = modelo;
}

/** Tabelas importáveis registradas por fase (o catálogo da Operação › Importações). */
export function tabelasImportaveis(): string[] {
  return Object.keys(TABELAS_IMPORT).filter((t) => GANCHOS[t]);
}

function definicao(tabela: unknown) {
  const t = String(tabela ?? '');
  const def = TABELAS_IMPORT[t];
  const ganchos = GANCHOS[t];
  if (!def || !ganchos) throw new ErroApp(422, 'TABELA_NAO_IMPORTAVEL', `Tabela não importável: ${t || '(vazia)'}`, [`Tabelas aceitas: ${tabelasImportaveis().join(', ')}`]);
  return { def, ganchos };
}

/** `padroes`: `{ coluna: valor }` declarados na prévia para células vazias (ex.: ano do perfil). */
function lerPadroes(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== undefined && x !== '').map(([k, x]) => [k, String(x)]));
}

async function contexto(req: Request): Promise<CtxImportacao> {
  const cidade = await cidadeDoRequest(req);
  return { dados: req.dados!, usuarioId: usuarioId(req), cidadeId: Number(cidade.id), cache: new Map(), papeis: { curador: temPapel(req, 'curador') } };
}

async function buscarImportacao(req: Request): Promise<Record<string, any>> {
  const imp = await req.dados!.buscar('importacoes', idDaRota(req));
  if (!imp) throw naoEncontrado();
  return imp;
}

function resumo(imp: Record<string, any>) {
  const { relatorio, relatorio_desfazer, ...resto } = imp;
  return { ...resto, colunas_ignoradas: relatorio?.colunas_ignoradas ?? [], previstas: relatorio?.previstas ?? null, bloqueio: relatorio?.bloqueio ?? null };
}

importacoes.get('/importacoes/tabelas', rota(async (_req, res) => {
  res.json({
    dados: tabelasImportaveis().map((t) => ({ tabela: t, titulo: TABELAS_IMPORT[t].titulo, modos: TABELAS_IMPORT[t].modos })),
  });
}));

importacoes.get('/importacoes/modelo/:tabela', rota(async (req, res) => {
  const { def } = definicao(req.params.tabela);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="modelo_${def.tabela}.csv"`);
  const atributos = atributosDoModelo ? await atributosDoModelo(req, def.tabela) : [];
  res.send(gerarCsv(cabecalhoModelo(def, atributos), []));
}));

importacoes.get('/importacoes', rota(async (req, res) => {
  const { pagina, por_pagina } = paginacao(req);
  const filtros: Record<string, unknown> = {};
  const tabela = textoQuery(req, 'tabela_alvo');
  const status = textoQuery(req, 'status');
  if (tabela) filtros.tabela_alvo = tabela;
  if (status) filtros.status = status;
  const r = await req.dados!.listar('importacoes', { filtros, pagina, por_pagina, ordenar: 'id', ordem: 'desc' });
  res.json({ ...r, dados: r.dados.map(resumo) });
}));

importacoes.get('/importacoes/:id', rota(async (req, res) => {
  const imp = await buscarImportacao(req);
  res.json({ ...imp, rejeicoes: (imp.relatorio?.rejeicoes ?? []).slice(0, MAX_REJEICOES_RELATORIO) });
}));

/**
 * Prévia (spec 6.9): grava a `importacoes` com o arquivo na hora (o `upload_id`
 * vale 10 min) e valida tudo sem gravar dado na tabela alvo.
 */
importacoes.post('/importacoes/previa', rota(async (req, res) => {
  exigirPapel(req, 'operador');
  const { def, ganchos } = definicao(req.body?.tabela_alvo);
  const modo = String(req.body?.modo_duplicata ?? 'ignorar') as ModoDuplicata;
  if (!def.modos.includes(modo)) throw new ErroApp(422, 'MODO_INVALIDO', `Modo não aceito para ${def.tabela}: ${modo}`, [`Modos aceitos: ${def.modos.join(', ')}`]);
  const uploadId = Number(req.body?.upload_id);
  if (!Number.isInteger(uploadId) || uploadId <= 0) throw new ErroApp(422, 'UPLOAD_OBRIGATORIO', 'Envie o arquivo antes da prévia (upload_id).');
  const padroes = lerPadroes(req.body?.padroes);
  const ctx = await contexto(req);
  const imp = await req.dados!.criar('importacoes', {
    tabela_alvo: def.tabela,
    tipo_arquivo: 'csv',
    arquivo: uploadId,
    modo_duplicata: modo,
    status: 'previa',
    autor_id: ctx.usuarioId,
    retrato_data: typeof req.body?.retrato_data === 'string' ? req.body.retrato_data : null,
  });
  const arquivo = await lerArquivoTexto(req.arquivos, Number(imp.arquivo));
  let validacao;
  try {
    validacao = await validarCsv(def, ganchos, arquivo.texto, ctx, modo, extensaoAtributos, padroes);
  } catch (e) {
    await req.dados!.atualizar('importacoes', imp.id, { status: 'falhou', relatorio: { erro: (e as Error).message } });
    throw e;
  }
  const atualizada = await req.dados!.atualizar('importacoes', imp.id, {
    total_linhas: validacao.total_linhas,
    rejeitadas: validacao.rejeicoes.length,
    arquivo_sha256: arquivo.sha256,
    mapeamento: { arquivo: arquivo.nome, padroes },
    relatorio: {
      previstas: validacao.previstas,
      colunas_ignoradas: validacao.colunas_ignoradas,
      bloqueio: validacao.bloqueio,
      rejeicoes: validacao.rejeicoes.slice(0, MAX_REJEICOES_RELATORIO),
    },
  });
  res.status(201).json({
    ...resumo(atualizada!),
    rejeicoes: validacao.rejeicoes.slice(0, MAX_REJEICOES_RESPOSTA),
  });
}));

/**
 * Refaz a prévia de uma importação ainda em prévia, sobre o mesmo arquivo, com
 * outro modo ou outros valores padrão (a tela oferece declarar o padrão de uma
 * coluna obrigatória vazia, como o ano do perfil).
 */
importacoes.post('/importacoes/:id/previa', rota(async (req, res) => {
  exigirPapel(req, 'operador');
  const imp = await buscarImportacao(req);
  if (imp.status !== 'previa' || imp.tipo_arquivo !== 'csv') throw new ErroApp(409, 'IMPORTACAO_NAO_APLICAVEL', `A importação está "${imp.status}"; só uma prévia de CSV pode ser refeita.`);
  const { def, ganchos } = definicao(imp.tabela_alvo);
  const modo = String(req.body?.modo_duplicata ?? imp.modo_duplicata) as ModoDuplicata;
  if (!def.modos.includes(modo)) throw new ErroApp(422, 'MODO_INVALIDO', `Modo não aceito para ${def.tabela}: ${modo}`);
  const padroes = { ...lerPadroes(imp.mapeamento?.padroes), ...lerPadroes(req.body?.padroes) };
  const ctx = await contexto(req);
  const arquivo = await lerArquivoTexto(req.arquivos, Number(imp.arquivo));
  const v = await validarCsv(def, ganchos, arquivo.texto, ctx, modo, extensaoAtributos, padroes);
  const atualizada = await req.dados!.atualizar('importacoes', imp.id, {
    modo_duplicata: modo,
    total_linhas: v.total_linhas,
    rejeitadas: v.rejeicoes.length,
    mapeamento: { ...(imp.mapeamento ?? {}), padroes },
    relatorio: { previstas: v.previstas, colunas_ignoradas: v.colunas_ignoradas, bloqueio: v.bloqueio, rejeicoes: v.rejeicoes.slice(0, MAX_REJEICOES_RELATORIO) },
  });
  res.json({ ...resumo(atualizada!), rejeicoes: v.rejeicoes.slice(0, MAX_REJEICOES_RESPOSTA) });
}));

importacoes.post('/importacoes/:id/cancelar', rota(async (req, res) => {
  exigirPapel(req, 'operador');
  const imp = await buscarImportacao(req);
  const r = await req.dados!.atualizarSe('importacoes', imp.id, { status: 'cancelada' }, { status: 'previa' });
  if (!r) throw new ErroApp(409, 'IMPORTACAO_NAO_APLICAVEL', `A importação está "${imp.status}"; só uma prévia pode ser cancelada.`);
  res.json(resumo(r));
}));

importacoes.post('/importacoes/:id/aplicar', rota(async (req, res) => {
  exigirPapel(req, 'operador');
  const imp = await buscarImportacao(req);
  if (imp.status !== 'previa') throw new ErroApp(409, 'IMPORTACAO_NAO_APLICAVEL', `A importação está "${imp.status}"; só uma prévia pode ser aplicada.`);
  const { def, ganchos } = definicao(imp.tabela_alvo);
  const travada = await req.dados!.atualizarSe('importacoes', imp.id, { status: 'aplicando' }, { status: 'previa' });
  if (!travada) throw new ErroApp(409, 'IMPORTACAO_NAO_APLICAVEL', 'Outra pessoa já está aplicando esta importação.');
  const ctx = await contexto(req);
  // A execução fica registrada em `coletas` com os contadores de domínio (spec 11.1, passo 2).
  const coleta = await req.dados!.criar('coletas', { tipo: 'importacao', disparo: 'manual', iniciado_em: new Date().toISOString(), status: 'executando', disparado_por_id: ctx.usuarioId });
  try {
    const arquivo = await lerArquivoTexto(req.arquivos, Number(imp.arquivo));
    const v = await validarCsv(def, ganchos, arquivo.texto, ctx, imp.modo_duplicata, extensaoAtributos, lerPadroes(imp.mapeamento?.padroes));
    if (v.bloqueio) throw new ErroApp(409, 'PREVIA_BLOQUEADA', v.bloqueio);
    const r = await aplicarValidacao(def, v, ctx, imp.id, ganchos);
    await req.dados!.atualizar('coletas', coleta.id, {
      status: r.rejeitadas ? 'parcial' : 'sucesso', finalizado_em: new Date().toISOString(),
      novos: r.inseridas, atualizados: r.atualizadas, erros: r.rejeitadas,
      detalhes_erros: r.rejeicoes.length ? r.rejeicoes.slice(0, 200).map((x) => `linha ${x.linha} ${x.coluna}: ${x.codigo} ${x.mensagem}`).join('\n').slice(0, 20000) : null,
    });
    const final = await req.dados!.atualizar('importacoes', imp.id, {
      coleta_id: coleta.id,
      status: 'aplicada',
      aplicada_em: new Date().toISOString(),
      total_linhas: v.total_linhas,
      inseridas: r.inseridas,
      atualizadas: r.atualizadas,
      ignoradas: r.ignoradas,
      rejeitadas: r.rejeitadas,
      relatorio: { ...(imp.relatorio ?? {}), colunas_ignoradas: v.colunas_ignoradas, rejeicoes: r.rejeicoes.slice(0, MAX_REJEICOES_RELATORIO), achados: r.achados },
    });
    res.json({ ...resumo(final!), rejeicoes: r.rejeicoes.slice(0, MAX_REJEICOES_RESPOSTA), achados: r.achados });
  } catch (e) {
    await req.dados!.atualizar('coletas', coleta.id, { status: 'falha', finalizado_em: new Date().toISOString(), erros: 1, detalhes_erros: String((e as Error).message).slice(0, 20000) });
    await req.dados!.atualizar('importacoes', imp.id, { status: 'falhou', coleta_id: coleta.id, relatorio: { ...(imp.relatorio ?? {}), erro: (e as Error).message } });
    throw e;
  }
}));

importacoes.post('/importacoes/:id/desfazer', rota(async (req, res) => {
  if (req.contexto?.nivelApp !== 'admin') throw new ErroApp(403, 'PAPEL_EXIGIDO', 'Só o admin da app desfaz uma importação.');
  const imp = await buscarImportacao(req);
  if (imp.status !== 'aplicada') throw new ErroApp(409, 'IMPORTACAO_NAO_DESFAZIVEL', `A importação está "${imp.status}"; só uma aplicada pode ser desfeita.`);
  const ctx = await contexto(req);
  const tabelas = [{ tabela: imp.tabela_alvo, temVersao: TABELAS_IMPORT[imp.tabela_alvo]?.temVersao ?? false, apagar: TABELAS_IMPORT[imp.tabela_alvo]?.semLixeira ?? false }, ...(extensaoAtributos ? [{ tabela: 'atributos_valor', temVersao: true, apagar: true }] : [])];
  const r = await desfazerImportacao(tabelas, imp, ctx);
  const final = await req.dados!.atualizar('importacoes', imp.id, {
    status: 'desfeita',
    desfeita_em: new Date().toISOString(),
    desfeita_por_id: ctx.usuarioId,
    relatorio_desfazer: r,
  });
  res.json({ ...resumo(final!), relatorio_desfazer: r });
}));
