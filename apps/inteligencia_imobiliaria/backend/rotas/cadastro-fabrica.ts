import { Router, type Request } from 'express';
import type { HelperDados } from '@urbiverso/sdk';
import { ErroApp, exigirPapel, idDaRota, naoEncontrado, ordenarEmMemoria, paginacao, rota, textoQuery, type Papel, usuarioId } from './comum';
import { criarCadastro, diferenca, editarCadastro, escolher, historico, removerCadastro, restaurarCadastro } from './cadastro-comum';
import { querCsv, responderCsv } from './exportar';
import type { ObjetoTipo } from '../../comum/objetos';
import { colunasAtributosCsv, idsPorAtributos } from '../atributos/filtro';

type Linha = Record<string, any>;

/** Evento de domínio gravado na mesma transação da escrita (spec 6; `anuncio_eventos`, `lancamento_eventos`). */
export interface DefEventos {
  tabela: string;
  fk: string;
  aoCriar?: (criado: Linha) => Linha | null;
  aoEditar?: (antes: Linha, depois: Linha, campos: string[]) => Linha | null;
  aoRemover?: (r: Linha) => Linha | null;
  aoRestaurar?: (r: Linha) => Linha | null;
}

export interface DefCadastro {
  tabela: string;
  base: string;
  papelEscrita?: Papel;
  /** Campos aceitos no criar. */
  camposCriar: readonly string[];
  /** Campos aceitos no editar. */
  camposEditar: readonly string[];
  obrigatoriosCriar: readonly string[];
  /** Colunas da exportação CSV (mais os derivados). */
  colunasCsv: string[];
  ordenar?: { coluna: string; ordem: 'asc' | 'desc' };
  /** Filtros da lista a partir da querystring (vocabulário fechado da tela). */
  filtros(req: Request): Promise<{ filtros: Record<string, unknown>; busca?: string; buscaColunas?: string[] }>;
  /** Valida e completa os dados de criar/editar; lança `ErroApp` com `detalhes` por campo. */
  preparar?(req: Request, dados: Linha, atual: Linha | null): Promise<Linha>;
  /** Derivados de leitura (nunca gravados). */
  derivar?(l: Linha): Linha;
  /** Colunas extras resolvidas em lote para a lista (ex.: nome da localidade). */
  anexar?(req: Request, linhas: Linha[]): Promise<Linha[]>;
  eventos?: DefEventos;
  /** Tipo de objeto (spec 5.24): liga o filtro `atr_<codigo>` e as colunas de atributo do CSV. */
  objeto?: ObjetoTipo;
  /** Contagens e blocos extras da ficha. */
  ficha?(req: Request, l: Linha): Promise<Linha>;
}

const TETO_LINHAS_LISTA = 100;

async function gravarEvento(trx: HelperDados, req: Request, ev: DefEventos, registroId: number, evento: Linha | null): Promise<void> {
  if (!evento) return;
  await trx.criar(ev.tabela, { [ev.fk]: registroId, ocorrido_em: new Date().toISOString(), autor_id: usuarioId(req), ...evento });
}

/** Nome da localidade anexado em lote (uma consulta por página). */
export async function anexarLocalidade(req: Request, linhas: Linha[]): Promise<Linha[]> {
  const ids = [...new Set(linhas.map((l) => l.localidade_id).filter(Boolean))];
  if (!ids.length) return linhas.map((l) => ({ ...l, localidade_nome: null }));
  const locs = await req.dados!.varrerTudo('localidades', { filtros: { id: ids }, removidos: 'incluir' });
  const nome = new Map(locs.map((l) => [l.id, l.nome]));
  return linhas.map((l) => ({ ...l, localidade_nome: nome.get(l.localidade_id) ?? null }));
}

/**
 * Rotas de um cadastro (spec 6.2, 6.4): lista com filtros e CSV, ficha,
 * criar, editar com versão, remover/restaurar, histórico e eventos. Toda
 * escrita grava `alteracoes_cadastro` e o evento de domínio na mesma transação.
 */
export function rotasCadastro(def: DefCadastro): Router {
  const r = Router();
  const papel = def.papelEscrita ?? 'curador';
  const derivar = (l: Linha) => (def.derivar ? { ...l, ...def.derivar(l) } : l);

  r.get(def.base, rota(async (req, res) => {
    const { filtros, busca, buscaColunas } = await def.filtros(req);
    if (def.objeto) {
      const ids = await idsPorAtributos(req, def.objeto);
      // Nenhum objeto passa: id 0 não existe, a lista volta vazia sem consulta especial.
      if (ids) filtros.id = ids.length ? ids : [0];
    }
    const removidos = textoQuery(req, 'removidos');
    // `relevancia` sem `texto` lança no helper (DADOS_ORDENACAO_INVALIDA): só nome de coluna passa.
    const pedida = textoQuery(req, 'ordenar');
    const opcoes = {
      filtros,
      ordenar: (pedida && /^[a-z][a-z0-9_]*$/.test(pedida) && pedida !== 'relevancia' ? pedida : undefined) ?? def.ordenar?.coluna ?? 'id',
      ordem: (textoQuery(req, 'ordem') === 'asc' ? 'asc' : textoQuery(req, 'ordem') === 'desc' ? 'desc' : def.ordenar?.ordem ?? 'desc') as 'asc' | 'desc',
      ...(busca && buscaColunas ? { busca_ou: { colunas: buscaColunas, termo: busca } } : {}),
      ...(removidos === 'incluir' || removidos === 'apenas' ? { removidos: removidos as 'incluir' | 'apenas' } : {}),
    };
    if (querCsv(req)) {
      const { ordenar, ordem, ...semOrdem } = opcoes;
      const linhas = ordenarEmMemoria(await req.dados!.varrerTudo(def.tabela, semOrdem), ordenar, ordem);
      const anexadas = (def.anexar ? await def.anexar(req, linhas) : linhas).map(derivar);
      const atr = def.objeto ? await colunasAtributosCsv(req.dados!, def.objeto, anexadas) : { colunas: [], linhas: anexadas };
      responderCsv(res, def.tabela, [...def.colunasCsv, ...atr.colunas], atr.linhas, textoQuery(req, 'localidade') ?? '');
      return;
    }
    const { pagina, por_pagina } = paginacao(req);
    const pagRes = await req.dados!.listar(def.tabela, { ...opcoes, pagina, por_pagina: Math.min(por_pagina, TETO_LINHAS_LISTA) });
    const anexadas = def.anexar ? await def.anexar(req, pagRes.dados) : pagRes.dados;
    res.json({ ...pagRes, dados: anexadas.map(derivar) });
  }));

  r.get(`${def.base}/:id`, rota(async (req, res) => {
    const id = idDaRota(req);
    const l = await req.dados!.buscar(def.tabela, id, { incluir_removidos: true });
    if (!l) throw naoEncontrado();
    const [anexada] = def.anexar ? await def.anexar(req, [l]) : [l];
    const extra = def.ficha ? await def.ficha(req, l) : {};
    res.json({ ...derivar(anexada), ...extra });
  }));

  r.get(`${def.base}/:id/historico`, rota(async (req, res) => {
    res.json({ dados: await historico(req, def.tabela, idDaRota(req)) });
  }));

  if (def.eventos) {
    const ev = def.eventos;
    r.get(`${def.base}/:id/eventos`, rota(async (req, res) => {
      const lista = await req.dados!.listar(ev.tabela, { filtros: { [ev.fk]: idDaRota(req) }, ordenar: 'ocorrido_em', ordem: 'desc', por_pagina: 100 });
      res.json(lista);
    }));
  }

  r.post(def.base, rota(async (req, res) => {
    exigirPapel(req, papel);
    let dados = escolher(req.body, def.camposCriar);
    const faltando = def.obrigatoriosCriar.filter((c) => dados[c] === undefined || dados[c] === null || dados[c] === '');
    if (faltando.length) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Faltam campos obrigatórios.', faltando.map((c) => `${c} é obrigatório.`));
    if (def.preparar) dados = await def.preparar(req, dados, null);
    const criado = await criarCadastro(req, def.tabela, dados, async (trx, c) => {
      if (def.eventos?.aoCriar) await gravarEvento(trx, req, def.eventos, Number(c.id), def.eventos.aoCriar(c));
    });
    res.status(201).json(derivar(criado));
  }));

  r.patch(`${def.base}/:id`, rota(async (req, res) => {
    exigirPapel(req, papel);
    const id = idDaRota(req);
    let patch = escolher(req.body, def.camposEditar);
    if (def.preparar) {
      const atual = await req.dados!.buscar(def.tabela, id);
      if (atual) patch = await def.preparar(req, patch, atual);
    }
    const r2 = await editarCadastro(req, def.tabela, id, patch, async (trx, antes, depois) => {
      const campos = Object.keys(diferenca(antes, patch));
      if (campos.length && def.eventos?.aoEditar) await gravarEvento(trx, req, def.eventos, id, def.eventos.aoEditar(antes, depois, campos));
    });
    res.json(derivar(r2));
  }));

  r.patch(`${def.base}/:id/remover`, rota(async (req, res) => {
    exigirPapel(req, papel);
    const id = idDaRota(req);
    const ev = def.eventos;
    const removido = await removerCadastro(req, def.tabela, id, ev?.aoRemover ? (trx, r2) => gravarEvento(trx, req, ev, id, ev.aoRemover!(r2)) : undefined);
    res.json(derivar(removido));
  }));

  r.patch(`${def.base}/:id/restaurar`, rota(async (req, res) => {
    exigirPapel(req, papel);
    const id = idDaRota(req);
    const ev = def.eventos;
    const restaurado = await restaurarCadastro(req, def.tabela, id, ev?.aoRestaurar ? (trx, r2) => gravarEvento(trx, req, ev, id, ev.aoRestaurar!(r2)) : undefined);
    res.json(derivar(restaurado));
  }));

  return r;
}

/** Filtro numérico de faixa `?<chave>=` → `coluna[gte|lte]`. */
export function faixa(req: Request, filtros: Record<string, unknown>, chaveMin: string, chaveMax: string, coluna: string): void {
  const min = Number(textoQuery(req, chaveMin));
  const max = Number(textoQuery(req, chaveMax));
  if (textoQuery(req, chaveMin) !== undefined && Number.isFinite(min)) filtros[`${coluna}[gte]`] = min;
  if (textoQuery(req, chaveMax) !== undefined && Number.isFinite(max)) filtros[`${coluna}[lte]`] = max;
}

/** Erros de validação por campo, num só 422 (C-69: `detalhes` é lista de texto). */
export function conferir(erros: string[]): void {
  if (erros.length) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Há campos inválidos.', erros);
}
