import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { HelperArquivos } from '@urbiverso/sdk';
import { lerCsv } from '../../comum/csv';
import { mapearCabecalho, type ColunaIgnorada, type ModoDuplicata, type TabelaImport } from '../../comum/importacao-chaves';
import { ErroApp } from '../rotas/comum';
import { converter, type ErroLinha } from './converter';
import type { AchadoNovo, CtxImportacao, GanchosTabela } from './tabelas';

export const TAMANHO_LOTE = 500;
export const MAX_REJEICOES_RELATORIO = 1000;
export const MAX_REJEICOES_RESPOSTA = 50;

export interface Rejeicao {
  linha: number;
  coluna: string;
  codigo: string;
  mensagem: string;
}

export type Acao = 'inserir' | 'atualizar' | 'ignorar';

export interface LinhaValida {
  linha: number;
  acao: Acao;
  dados: Record<string, unknown>;
  presentes: string[];
  achados: AchadoNovo[];
  existente: Record<string, any> | null;
  /** Hook pós-gravação (ex.: valores de atributo da mesma linha). */
  depois?: (registroId: number, ctx: CtxImportacao, importacaoId: number) => Promise<void>;
}

export interface Validacao {
  total_linhas: number;
  validas: LinhaValida[];
  rejeicoes: Rejeicao[];
  colunas_ignoradas: ColunaIgnorada[];
  previstas: Record<Acao, number>;
  bloqueio: string | null;
}

/** Ganchos extras por coluna `atr_<codigo>` (atributos, 15.1a); ausente = coluna desconhecida. */
export interface ExtensaoAtributos {
  preparar(tabela: string, colunas: { indice: number; codigo: string }[], ctx: CtxImportacao): Promise<{
    ignoradas: ColunaIgnorada[];
    validar(celulas: string[], erros: ErroLinha[]): ((registroId: number, ctx: CtxImportacao, importacaoId: number) => Promise<void>) | undefined;
  }>;
}

export async function lerArquivoTexto(arquivos: HelperArquivos | undefined, arquivoId: number): Promise<{ texto: string; sha256: string; nome: string; mime: string }> {
  if (!arquivos) throw new ErroApp(500, 'ARQUIVOS_INDISPONIVEL', 'Serviço de arquivos indisponível.');
  const lido = await arquivos.ler(arquivoId);
  if (!lido) throw new ErroApp(410, 'ARQUIVO_EXPIRADO', 'O arquivo da importação não está mais disponível; envie de novo.');
  const buffer = await readFile(lido.caminho_fs);
  return {
    texto: buffer.toString('utf8'),
    sha256: createHash('sha256').update(buffer).digest('hex'),
    nome: lido.meta.nome_original,
    mime: lido.meta.mime,
  };
}

/** Lê todas as linhas vivas da tabela, indexadas pela chave natural. */
async function carregarExistentes(def: TabelaImport, ganchos: GanchosTabela, ctx: CtxImportacao): Promise<Map<string, Record<string, any>>> {
  const linhas = await ctx.dados.varrerTudo(def.tabela);
  const mapa = new Map<string, Record<string, any>>();
  for (const l of linhas) {
    const k = ganchos.chave(l);
    if (k) mapa.set(k, l);
  }
  return mapa;
}

/**
 * Valida o CSV inteiro sem gravar nada (spec 11.1, passo 1): tipo, opções,
 * obrigatórios, referências, duplicata no arquivo e contra o banco.
 */
export async function validarCsv(
  def: TabelaImport,
  ganchos: GanchosTabela,
  conteudo: string,
  ctx: CtxImportacao,
  modo: ModoDuplicata,
  atributos?: ExtensaoAtributos,
  padroes: Record<string, string> = {},
): Promise<Validacao> {
  const csv = lerCsv(conteudo);
  if (csv.cabecalho.length === 0) throw new ErroApp(422, 'CSV_VAZIO', 'O arquivo não tem cabeçalho.');
  const mapa = mapearCabecalho(def, csv.cabecalho);
  const colunas_ignoradas = [...mapa.ignoradas];
  let extensao: Awaited<ReturnType<ExtensaoAtributos['preparar']>> | null = null;
  if (mapa.atributos.length) {
    if (atributos) {
      extensao = await atributos.preparar(def.tabela, mapa.atributos, ctx);
      colunas_ignoradas.push(...extensao.ignoradas);
    } else {
      colunas_ignoradas.push(...mapa.atributos.map((a) => ({ cabecalho: csv.cabecalho[a.indice], motivo: 'desconhecida' as const })));
    }
  }
  // Valor padrão declarado na prévia (gravado no mapeamento): preenche só célula vazia.
  const campos = mapa.campos;
  const camposPadrao = campos.filter((c) => padroes[c.coluna] !== undefined && padroes[c.coluna] !== '');
  const mapeadas = new Set([...mapa.colunas.map((c) => c.campo.coluna), ...camposPadrao.map((c) => c.coluna), ...(mapa.extras.length ? ['extras'] : [])]);
  const faltando = campos.filter((c) => c.obrigatorio && !mapeadas.has(c.coluna)).map((c) => c.coluna);
  // No modo `atualizar` o CSV pode trazer só o que muda; a linha que não existe ainda é que exige tudo.
  if (faltando.length && modo !== 'atualizar') {
    throw new ErroApp(422, 'COLUNA_OBRIGATORIA_AUSENTE', 'O CSV não tem colunas obrigatórias da tabela.', faltando.map((c) => `Falta a coluna ${c}. Baixe o modelo para ver o cabeçalho esperado.`));
  }
  await ganchos.carregar?.(ctx);
  const existentes = await carregarExistentes(def, ganchos, ctx);
  const vistas = new Map<string, number>();
  const validas: LinhaValida[] = [];
  const rejeicoes: Rejeicao[] = [];
  const previstas: Record<Acao, number> = { inserir: 0, atualizar: 0, ignorar: 0 };
  let bloqueio: string | null = null;

  for (let i = 0; i < csv.linhas.length; i++) {
    const numeroLinha = i + 2; // 1 é o cabeçalho
    const celulas = csv.linhas[i];
    const erros: ErroLinha[] = [];
    const valores: Record<string, unknown> = {};
    for (const m of mapa.colunas) {
      let alvo = { indice: m.indice, pct: m.pct };
      if ((celulas[m.indice] ?? '').trim() === '') alvo = m.alternativas.find((a) => (celulas[a.indice] ?? '').trim() !== '') ?? alvo;
      const r = converter(m.campo, celulas[alvo.indice] ?? '', alvo.pct);
      if (r.ok) valores[m.campo.coluna] = r.valor;
      else erros.push(r.erro);
    }
    if (mapa.extras.length) {
      const extras: Record<string, string> = {};
      for (const x of mapa.extras) {
        const v = (celulas[x.indice] ?? '').trim();
        if (v !== '') extras[x.nome] = v;
      }
      valores.extras = Object.keys(extras).length ? extras : null;
    }
    for (const c of camposPadrao) {
      if (valores[c.coluna] !== null && valores[c.coluna] !== undefined) continue;
      const r = converter(c, padroes[c.coluna], false);
      if (r.ok) valores[c.coluna] = r.valor;
      else erros.push({ ...r.erro, mensagem: `valor padrão declarado: ${r.erro.mensagem}` });
    }
    for (const c of campos) {
      if (c.obrigatorio && mapeadas.has(c.coluna) && (valores[c.coluna] === null || valores[c.coluna] === undefined)) {
        if (!erros.some((e) => e.coluna === c.coluna)) erros.push({ coluna: c.coluna, codigo: 'OBRIGATORIO', mensagem: 'valor obrigatório vazio' });
      }
    }
    const depois = extensao?.validar(celulas, erros);
    const preparada = erros.length ? null : await ganchos.preparar(valores, ctx, erros);
    if (erros.length || !preparada) {
      for (const e of erros) rejeicoes.push({ linha: numeroLinha, ...e });
      continue;
    }
    const chave = ganchos.chave(preparada.dados);
    if (chave) {
      const anterior = vistas.get(chave);
      if (anterior !== undefined) {
        rejeicoes.push({ linha: numeroLinha, coluna: def.chave.join('+'), codigo: 'DUPLICATA_NO_ARQUIVO', mensagem: `mesma chave da linha ${anterior}` });
        if (modo === 'falhar') bloqueio ??= `Duplicata no arquivo (linha ${numeroLinha}).`;
        continue;
      }
      vistas.set(chave, numeroLinha);
    }
    const existente = chave ? existentes.get(chave) ?? null : null;
    let acao: Acao = 'inserir';
    if (!existente && faltando.length) {
      for (const c of faltando) rejeicoes.push({ linha: numeroLinha, coluna: c, codigo: 'OBRIGATORIO', mensagem: 'registro novo sem coluna obrigatória' });
      continue;
    }
    if (existente) {
      if (modo === 'falhar') {
        rejeicoes.push({ linha: numeroLinha, coluna: def.chave.join('+'), codigo: 'DUPLICATA', mensagem: `já existe (id ${existente.id})` });
        bloqueio ??= `Registro já existente (linha ${numeroLinha}) com o modo "falhar".`;
        continue;
      }
      acao = modo === 'atualizar' ? 'atualizar' : 'ignorar';
    }
    const presentes = colunasPresentes(def, ganchos, [...mapeadas], preparada.dados);
    previstas[acao]++;
    validas.push({ linha: numeroLinha, acao, dados: preparada.dados, presentes, achados: preparada.achados, existente, depois });
  }
  return { total_linhas: csv.linhas.length, validas, rejeicoes, colunas_ignoradas, previstas, bloqueio };
}

/** No modo `atualizar`, só as colunas que o CSV trouxe (e o que deriva delas) são tocadas. */
function colunasPresentes(def: TabelaImport, ganchos: GanchosTabela, mapeadas: string[], dados: Record<string, unknown>): string[] {
  const virtuais = new Set(def.campos.filter((c) => c.virtual).map((c) => c.coluna));
  const presentes = new Set<string>();
  for (const c of mapeadas) {
    if (!virtuais.has(c)) presentes.add(c);
    else if (`${c}_id` in dados) presentes.add(`${c}_id`);
    else if (['preenchimento', 'contorno_cor', 'opacidade_preenchimento', 'espessura', 'cor'].includes(c)) presentes.add('estilo');
    for (const d of ganchos.derivadasDe?.[c] ?? []) presentes.add(d);
  }
  return [...presentes].filter((c) => c in dados);
}

export interface ResultadoAplicar {
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  rejeitadas: number;
  rejeicoes: Rejeicao[];
  achados: number;
}

function mensagemDeErro(e: unknown): { codigo: string; mensagem: string } {
  const x = e as { codigo?: string; code?: string; message?: string };
  return { codigo: x?.codigo ?? (x?.code === '23505' ? 'DUPLICATA' : 'ERRO_GRAVACAO'), mensagem: String(x?.message ?? e).slice(0, 300) };
}

async function gravarLinha(def: TabelaImport, l: LinhaValida, ctx: CtxImportacao, importacaoId: number, trx = ctx.dados, ganchos?: GanchosTabela): Promise<number | null> {
  if (l.acao === 'ignorar') return l.existente ? Number(l.existente.id) : null;
  if (l.acao === 'inserir') {
    const criado = await trx.criar(def.tabela, { ...l.dados, importacao_id: importacaoId });
    if (ganchos?.aposCriar) await ganchos.aposCriar(trx, criado, ctx);
    return Number(criado.id);
  }
  const ex = l.existente!;
  const patch: Record<string, unknown> = {};
  for (const c of l.presentes) patch[c] = l.dados[c];
  if (def.temVersao) {
    const r = await trx.atualizarSe(def.tabela, Number(ex.id), { ...patch, versao: Number(ex.versao) + 1 }, { versao: ex.versao });
    if (!r) throw new ErroApp(409, 'CONFLITO_VERSAO', 'o registro mudou durante a importação');
  } else {
    await trx.atualizar(def.tabela, Number(ex.id), patch);
  }
  return Number(ex.id);
}

/**
 * Aplica a validação em lotes de 500, uma transação por lote (spec 11.1,
 * passo 2). Lote que falha é refeito linha a linha, para que uma linha
 * recusada pelo banco não derrube as outras.
 */
export async function aplicarValidacao(def: TabelaImport, v: Validacao, ctx: CtxImportacao, importacaoId: number, ganchos?: GanchosTabela): Promise<ResultadoAplicar> {
  if (ganchos?.antesDeAplicar) await ganchos.antesDeAplicar(v.validas.filter((l) => l.acao !== 'ignorar'), ctx);
  const r: ResultadoAplicar = { inseridas: 0, atualizadas: 0, ignoradas: 0, rejeitadas: v.rejeicoes.length, rejeicoes: [...v.rejeicoes], achados: 0 };
  const gravadas: { linha: LinhaValida; id: number | null }[] = [];
  for (let i = 0; i < v.validas.length; i += TAMANHO_LOTE) {
    const lote = v.validas.slice(i, i + TAMANHO_LOTE);
    try {
      const ids = await ctx.dados.transaction(async (trx) => {
        const out: (number | null)[] = [];
        for (const l of lote) {
          const id = await gravarLinha(def, l, ctx, importacaoId, trx, ganchos);
          if (id !== null && l.depois && l.acao !== 'ignorar') await l.depois(id, { ...ctx, dados: trx }, importacaoId);
          out.push(id);
        }
        return out;
      });
      lote.forEach((l, k) => gravadas.push({ linha: l, id: ids[k] }));
    } catch {
      for (const l of lote) {
        try {
          const id = await ctx.dados.transaction(async (trx) => {
            const novo = await gravarLinha(def, l, ctx, importacaoId, trx, ganchos);
            if (novo !== null && l.depois && l.acao !== 'ignorar') await l.depois(novo, { ...ctx, dados: trx }, importacaoId);
            return novo;
          });
          gravadas.push({ linha: l, id });
        } catch (e) {
          r.rejeitadas++;
          r.rejeicoes.push({ linha: l.linha, coluna: '', ...mensagemDeErro(e) });
        }
      }
    }
  }
  for (const g of gravadas) {
    if (g.linha.acao === 'inserir') r.inseridas++;
    else if (g.linha.acao === 'atualizar') r.atualizadas++;
    else r.ignoradas++;
  }
  // Achados não bloqueantes, depois do COMMIT de cada lote (spec 11.1).
  const agora = new Date().toISOString();
  for (const g of gravadas) {
    for (const a of g.linha.achados) {
      await ctx.dados.criar('achados_qualidade', {
        tabela: def.tabela,
        registro_id: g.id,
        campo: a.campo ?? null,
        codigo: a.codigo,
        severidade: a.severidade,
        mensagem: a.mensagem.slice(0, 1000),
        valor: a.valor?.slice(0, 500) ?? null,
        origem: 'importacao',
        detectado_em: agora,
        importacao_id: importacaoId,
      });
      r.achados++;
    }
  }
  return r;
}

export interface ResultadoDesfazer {
  removidas: { tabela: string; id: number }[];
  mantidas: { tabela: string; id: number; motivo: string }[];
}

/**
 * Desfaz uma importação (spec 11.3.2): remoção lógica das linhas criadas por
 * ela que ninguém editou depois; nunca apaga de vez.
 */
export async function desfazerImportacao(
  tabelas: { tabela: string; temVersao: boolean; apagar?: boolean }[],
  importacao: Record<string, any>,
  ctx: CtxImportacao,
): Promise<ResultadoDesfazer> {
  const out: ResultadoDesfazer = { removidas: [], mantidas: [] };
  const aplicadaEm = importacao.aplicada_em ? new Date(importacao.aplicada_em).getTime() : Infinity;
  for (const { tabela, temVersao, apagar } of tabelas) {
    const linhas = await ctx.dados.varrerTudo(tabela, { filtros: { importacao_id: importacao.id } });
    for (const l of linhas) {
      const editada = temVersao ? Number(l.versao) !== 1 : new Date(l.atualizado_em).getTime() > aplicadaEm + 60_000;
      if (editada) {
        out.mantidas.push({ tabela, id: Number(l.id), motivo: 'editada depois da importação' });
        continue;
      }
      // Tabela sem soft delete (valores de atributo) apaga a linha; o resto vai para a lixeira.
      if (apagar) await ctx.dados.deletar(tabela, Number(l.id));
      else await ctx.dados.remover(tabela, Number(l.id), ctx.usuarioId);
      out.removidas.push({ tabela, id: Number(l.id) });
    }
  }
  return out;
}
