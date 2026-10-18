import { Router, type Request } from 'express';
import { caixasCruzam, validarGeometria, type Geometria } from '../../comum/geo';
import { lerGeoArquivo } from '../importacao/geoarquivo';
import { derivarGeometria } from '../importacao/tabelas';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ErroApp, exigirPapel, idDaRota, naoEncontrado, numeroQuery, ordenarEmMemoria, paginacao, rota, textoQuery, usuarioId } from './comum';
import { criarCadastro, editarCadastro, escolher, historico, removerCadastro, restaurarCadastro } from './cadastro-comum';
import { querCsv, responderCsv } from './exportar';
import { colunasAtributosCsv, idsPorAtributos } from '../atributos/filtro';
import { cidadeDoRequest } from './territorio-comum';

export const territorio: Router = Router();

// ---------------------------------------------------------------- cidades

territorio.get('/cidades', rota(async (req, res) => {
  const r = await req.dados!.listar('cidades', { filtros: { ativa: true }, ordenar: 'nome', ordem: 'asc', por_pagina: 100 });
  res.json(r);
}));

// ------------------------------------------------------------ localidades

const CAMPOS_LOCALIDADE = [
  'tipo', 'codigo', 'codigo_romano', 'codigo_legado', 'numero', 'nome', 'nome_fonte', 'localidade_pai_id',
  'classificacao_fonte', 'regra_mapeamento', 'nota_metodologica', 'vigente_de', 'vigente_ate', 'area_km2',
  'ponto_referencia_latitude', 'ponto_referencia_longitude', 'referencia_legal', 'qualidade', 'notas',
] as const;
const CAMPOS_LOCALIDADE_EDITAVEIS = ['nome', 'localidade_pai_id', 'classificacao_fonte', 'ponto_referencia_latitude', 'ponto_referencia_longitude', 'notas', 'nome_fonte', 'qualidade'] as const;

/** Perfil mais recente e contorno vigente de cada localidade (spec 6.1). */
async function anexarPerfilEContorno(req: Request, locais: Record<string, any>[]): Promise<Record<string, any>[]> {
  if (locais.length === 0) return locais;
  const ids = locais.map((l) => l.id);
  const perfis = await req.dados!.varrerTudo('localidade_perfis', { filtros: { localidade_id: ids } });
  const contornos = await req.dados!.varrerTudo('contornos', { filtros: { localidade_id: ids, status: 'ativo', tipo_entidade: 'regiao_administrativa' } });
  const perfilDe = new Map<number, Record<string, any>>();
  for (const p of perfis) {
    const atual = perfilDe.get(p.localidade_id);
    if (!atual || Number(p.ano_referencia) > Number(atual.ano_referencia)) perfilDe.set(p.localidade_id, p);
  }
  const contornoDe = new Map<number, number>();
  for (const c of contornos) if (!contornoDe.has(c.localidade_id)) contornoDe.set(c.localidade_id, c.id);
  return locais.map((l) => ({ ...l, perfil: perfilDe.get(l.id) ?? null, contorno_id: contornoDe.get(l.id) ?? null }));
}

territorio.get('/localidades', rota(async (req, res) => {
  const cidade = await cidadeDoRequest(req);
  const filtros: Record<string, unknown> = { cidade_id: cidade.id };
  const tipo = textoQuery(req, 'tipo');
  if (tipo) filtros.tipo = tipo;
  const q = textoQuery(req, 'q');
  const opcoes = { filtros, ordenar: 'nome', ordem: 'asc' as const, ...(q ? { busca_ou: { colunas: ['nome', 'nome_fonte', 'codigo'], termo: q } } : {}) };
  if (querCsv(req)) {
    const linhas = await req.dados!.varrerTudo('localidades', opcoes);
    responderCsv(res, 'localidades', ['id', ...CAMPOS_LOCALIDADE, 'versao'], linhas, tipo ?? '');
    return;
  }
  const { pagina } = paginacao(req);
  const por_pagina = Math.min(Math.max(1, Number(req.query.por_pagina) || 100), 100);
  const r = await req.dados!.listar('localidades', { ...opcoes, pagina, por_pagina });
  res.json({ ...r, dados: await anexarPerfilEContorno(req, r.dados) });
}));

territorio.get('/localidades/:id', rota(async (req, res) => {
  const loc = await req.dados!.buscar('localidades', idDaRota(req));
  if (!loc) throw naoEncontrado();
  const [comPerfil] = await anexarPerfilEContorno(req, [loc]);
  const perfis = await req.dados!.listar('localidade_perfis', { filtros: { localidade_id: loc.id }, ordenar: 'ano_referencia', ordem: 'desc', por_pagina: 50 });
  res.json({ ...comPerfil, perfis: perfis.dados, contagens: await contagensLocalidade(req, loc.id) });
}));

/** Contagens por localidade; cada fase acrescenta a sua tabela. */
export const CONTAGENS_LOCALIDADE: { chave: string; tabela: string; filtros?: Record<string, unknown> }[] = [];

async function contagensLocalidade(req: Request, id: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const c of CONTAGENS_LOCALIDADE) {
    const r = await req.dados!.listar(c.tabela, { filtros: { localidade_id: id, ...(c.filtros ?? {}) }, por_pagina: 1 });
    out[c.chave] = r.total;
  }
  return out;
}

territorio.get('/localidades/:id/historico', rota(async (req, res) => {
  res.json({ dados: await historico(req, 'localidades', idDaRota(req)) });
}));

territorio.post('/localidades', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const cidade = await cidadeDoRequest(req);
  const dados = escolher(req.body, CAMPOS_LOCALIDADE);
  if (!dados.nome || !dados.codigo) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Nome e código são obrigatórios.', ['Preencha nome e código.']);
  if (!['submercado', 'bairro', 'municipio', 'agregado'].includes(String(dados.tipo))) {
    throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Tipo inválido para localidade manual.', ['RAs vêm da semente e da importação; crie submercado, bairro, município ou agregado.']);
  }
  const criado = await criarCadastro(req, 'localidades', { ...dados, cidade_id: cidade.id });
  res.status(201).json(criado);
}));

territorio.patch('/localidades/:id', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const r = await editarCadastro(req, 'localidades', idDaRota(req), escolher(req.body, CAMPOS_LOCALIDADE_EDITAVEIS));
  res.json(r);
}));

// -------------------------------------------------------------- contornos

const CAMPOS_CONTORNO_LISTA = [
  'id', 'id_legado', 'nome', 'categoria', 'subcategoria', 'tipo_entidade', 'entidade_codigo', 'papel_geometria',
  'localidade_id', 'grupo_camada', 'geometria_tipo', 'area_m2', 'perimetro_m', 'status', 'vigente_de', 'vigente_ate', 'versao',
];
const CAMPOS_CONTORNO_EDITAVEIS = ['nome', 'categoria', 'subcategoria', 'estilo', 'localidade_id', 'status', 'descricao', 'ordem_camada', 'vigente_ate'] as const;

function caixaDaQuery(req: Request): { oeste: number; sul: number; leste: number; norte: number } | null {
  const t = textoQuery(req, 'bbox');
  if (!t) return null;
  const n = t.split(',').map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) throw new ErroApp(400, 'BBOX_INVALIDA', 'bbox deve ser oeste,sul,leste,norte.');
  return { oeste: n[0], sul: n[1], leste: n[2], norte: n[3] };
}

function filtrosContornos(req: Request): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  for (const [q, c] of [['grupo', 'grupo_camada'], ['tipo_entidade', 'tipo_entidade'], ['status', 'status'], ['localidade_id', 'localidade_id']] as const) {
    const v = textoQuery(req, q);
    if (v) f[c] = v;
  }
  const cx = caixaDaQuery(req);
  if (cx) Object.assign(f, { 'bbox_oeste[lte]': cx.leste, 'bbox_leste[gte]': cx.oeste, 'bbox_sul[lte]': cx.norte, 'bbox_norte[gte]': cx.sul });
  return f;
}

/** Lista de contornos: GeoJSON para o mapa (padrão), tabela (`formato=lista`) ou CSV. */
territorio.get('/contornos', rota(async (req, res) => {
  const filtros = filtrosContornos(req);
  const porAtributo = await idsPorAtributos(req, 'contorno');
  if (porAtributo) filtros.id = porAtributo.length ? porAtributo : [0];
  if (req.query.formato === 'lista') {
    const { pagina, por_pagina } = paginacao(req);
    const q = textoQuery(req, 'q');
    const r = await req.dados!.listar('contornos', { filtros, pagina, por_pagina, ordenar: 'nome', ordem: 'asc', ...(q ? { busca_ou: { colunas: ['nome', 'categoria', 'id_legado'], termo: q } } : {}) });
    res.json({ ...r, dados: r.dados.map((c) => Object.fromEntries(CAMPOS_CONTORNO_LISTA.map((k) => [k, c[k] ?? null]))) });
    return;
  }
  const linhas = ordenarEmMemoria(await req.dados!.varrerTudo('contornos', { filtros }), 'ordem_camada');
  if (querCsv(req)) {
    const atr = await colunasAtributosCsv(req.dados!, 'contorno', linhas);
    responderCsv(res, 'contornos', [...CAMPOS_CONTORNO_LISTA, 'geometria', 'estilo', 'fonte_url', 'qualidade', ...atr.colunas], atr.linhas);
    return;
  }
  const cx = caixaDaQuery(req);
  res.json({
    type: 'FeatureCollection',
    features: linhas
      .filter((c) => !cx || caixasCruzam(cx, { oeste: Number(c.bbox_oeste), sul: Number(c.bbox_sul), leste: Number(c.bbox_leste), norte: Number(c.bbox_norte) }))
      .map((c) => ({
        type: 'Feature',
        id: c.id,
        geometry: c.geometria,
        properties: { id: c.id, nome: c.nome, tipo_entidade: c.tipo_entidade, papel_geometria: c.papel_geometria, localidade_id: c.localidade_id, grupo_camada: c.grupo_camada, ordem_camada: c.ordem_camada, estilo: c.estilo ?? null },
      })),
  });
}));

territorio.get('/contornos/:id', rota(async (req, res) => {
  const c = await req.dados!.buscar('contornos', idDaRota(req));
  if (!c) throw naoEncontrado();
  res.json(c);
}));

territorio.get('/contornos/:id/historico', rota(async (req, res) => {
  res.json({ dados: await historico(req, 'contornos', idDaRota(req)) });
}));

function geometriaValida(g: unknown): Geometria {
  const erros = validarGeometria(g);
  if (erros.length) throw new ErroApp(400, 'POLIGONO_INVALIDO', 'Geometria inválida.', erros);
  return g as Geometria;
}

/** Contorno desenhado no `urbi-mapa` (cabe nos 100 KB do corpo; D-92). */
territorio.post('/contornos', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const g = geometriaValida(req.body?.geometria);
  const dados = escolher(req.body, ['nome', 'categoria', 'subcategoria', 'estilo', 'localidade_id', 'descricao'] as const);
  if (!dados.nome) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Dê um nome ao contorno.', ['nome é obrigatório.']);
  const derivadas = derivarGeometria(g);
  const criado = await criarCadastro(req, 'contornos', {
    ...dados,
    geometria: g,
    ...derivadas,
    tipo_entidade: 'area_personalizada',
    papel_geometria: g.type.includes('Line') ? 'eixo_rota' : 'limite_exibicao',
    grupo_camada: 'poligonais_desenhadas',
    status: 'ativo',
    fonte_sistema: 'desenho',
  });
  res.status(201).json(criado);
}));

territorio.patch('/contornos/:id', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const patch = escolher(req.body, CAMPOS_CONTORNO_EDITAVEIS);
  if (req.body?.geometria !== undefined) Object.assign(patch, { geometria: geometriaValida(req.body.geometria), ...derivarGeometria(req.body.geometria) });
  res.json(await editarCadastro(req, 'contornos', idDaRota(req), patch));
}));

territorio.patch('/contornos/:id/remover', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  res.json(await removerCadastro(req, 'contornos', idDaRota(req)));
}));

territorio.patch('/contornos/:id/restaurar', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  res.json(await restaurarCadastro(req, 'contornos', idDaRota(req)));
}));

// --------------------------------------------- importação de KML/KMZ/GeoJSON

/** Vértices para a prévia; geometria sem `coordinates` (já com erro) conta 0. */
export function contarVertices(g: Geometria | null | undefined): number {
  return Array.isArray(g?.coordinates) ? JSON.stringify(g!.coordinates).split('],[').length : 0;
}

/** Prévia que falha depois de gravar a importação não fica presa em `previa`. */
export async function previaOuFalha<T>(req: Request, importacaoId: number, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    await req.dados!.atualizar('importacoes', importacaoId, { status: 'falhou', relatorio: { erro: (e as Error).message } }).catch(() => undefined);
    throw e;
  }
}

/**
 * Aplicação travada (`previa` → `aplicando`), como a do CSV: dois cliques não
 * duplicam. A gravação é uma transação só; se ela falha, nada foi gravado e a
 * importação volta a `previa` para nova tentativa.
 */
export async function aplicarTravado<T>(req: Request, importacaoId: number, fn: () => Promise<T>): Promise<T> {
  const travada = await req.dados!.atualizarSe('importacoes', importacaoId, { status: 'aplicando' }, { status: 'previa' });
  if (!travada) throw new ErroApp(409, 'IMPORTACAO_NAO_APLICAVEL', 'Esta importação já foi aplicada ou está sendo aplicada.');
  try {
    return await fn();
  } catch (e) {
    await req.dados!.atualizar('importacoes', importacaoId, { status: 'previa' }).catch(() => undefined);
    throw e;
  }
}

export async function lerFeicoes(req: Request, arquivoId: number) {
  const lido = await req.arquivos?.ler(arquivoId);
  if (!lido) throw new ErroApp(410, 'ARQUIVO_EXPIRADO', 'O arquivo não está mais disponível; envie de novo.');
  const bytes = new Uint8Array(await readFile(lido.caminho_fs));
  try {
    return { ...lerGeoArquivo(bytes), sha256: createHash('sha256').update(bytes).digest('hex'), nome: lido.meta.nome_original };
  } catch (e) {
    throw new ErroApp(422, 'ARQUIVO_GEO_INVALIDO', `Não consegui ler o arquivo: ${(e as Error).message}.`, ['Envie KML, KMZ ou GeoJSON em EPSG:4326.']);
  }
}

/**
 * Recebe o `upload_id` e grava na hora a `importacoes` com o arquivo (o upload
 * vale 10 min; C-38); devolve a prévia das feições, sem criar contorno.
 */
territorio.post('/contornos/importar', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const uploadId = Number(req.body?.upload_id);
  if (!Number.isInteger(uploadId) || uploadId <= 0) throw new ErroApp(422, 'UPLOAD_OBRIGATORIO', 'Envie o arquivo antes (upload_id).');
  const imp = await req.dados!.criar('importacoes', {
    tabela_alvo: 'contornos', tipo_arquivo: 'outro', arquivo: uploadId, modo_duplicata: 'ignorar', status: 'previa', autor_id: usuarioId(req),
  });
  const { lido, feicoes } = await previaOuFalha(req, Number(imp.id), async () => {
    const lido = await lerFeicoes(req, Number(imp.arquivo));
    const feicoes = lido.feicoes.map((f, i) => {
      const valida = f.erros.length === 0;
      const cx = valida ? derivarGeometria(f.geometria) : null;
      return { indice: i, nome: f.nome, tipo: f.geometria?.type ?? null, vertices: contarVertices(f.geometria), erros: f.erros, bbox: cx ? [cx.bbox_oeste, cx.bbox_sul, cx.bbox_leste, cx.bbox_norte] : null };
    });
    await req.dados!.atualizar('importacoes', imp.id, {
      total_linhas: feicoes.length,
      rejeitadas: feicoes.filter((f) => f.erros.length).length,
      arquivo_sha256: lido.sha256,
      mapeamento: { arquivo: lido.nome, formato: lido.formato },
    });
    return { lido, feicoes };
  });
  res.status(201).json({ importacao_id: imp.id, formato: lido.formato, feicoes });
}));

/** Aplica a prévia lendo o arquivo da importação: cria os contornos sem duplicar (`geometria_hash`). */
territorio.post('/contornos/importar/:importacao_id/aplicar', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const imp = await req.dados!.buscar('importacoes', idDaRota(req, 'importacao_id'));
  if (!imp || imp.tabela_alvo !== 'contornos' || imp.tipo_arquivo !== 'outro') throw naoEncontrado();
  if (imp.status !== 'previa') throw new ErroApp(409, 'IMPORTACAO_NAO_APLICAVEL', `A importação está "${imp.status}".`);
  res.json(await aplicarTravado(req, Number(imp.id), () => aplicarContornos(req, imp)));
}));

async function aplicarContornos(req: Request, imp: Record<string, any>) {
  const lido = await lerFeicoes(req, Number(imp.arquivo));
  const escolhidas: number[] | null = Array.isArray(req.body?.indices) ? req.body.indices.map(Number) : null;
  const categoria = typeof req.body?.categoria === 'string' ? req.body.categoria.slice(0, 60) : null;
  const localidadeId = Number(req.body?.localidade_id) || null;
  const existentes = await req.dados!.varrerTudo('contornos', { filtros: { tipo_entidade: 'area_personalizada' } });
  const hashes = new Set(existentes.map((c) => c.geometria_hash));
  let inseridas = 0;
  let ignoradas = 0;
  const rejeicoes: { linha: number; coluna: string; codigo: string; mensagem: string }[] = [];
  await req.dados!.transaction(async (trx) => {
    for (const [i, f] of lido.feicoes.entries()) {
      if (escolhidas && !escolhidas.includes(i)) {
        ignoradas++;
        continue;
      }
      if (f.erros.length) {
        rejeicoes.push({ linha: i + 1, coluna: 'geometria', codigo: 'POLIGONO_INVALIDO', mensagem: f.erros.join('; ') });
        continue;
      }
      const derivadas = derivarGeometria(f.geometria);
      if (hashes.has(derivadas.geometria_hash)) {
        ignoradas++;
        continue;
      }
      hashes.add(derivadas.geometria_hash);
      await trx.criar('contornos', {
        nome: f.nome.slice(0, 200),
        categoria,
        localidade_id: localidadeId,
        geometria: f.geometria,
        ...derivadas,
        tipo_entidade: 'area_personalizada',
        papel_geometria: f.geometria.type.includes('Line') ? 'eixo_rota' : 'limite_exibicao',
        grupo_camada: 'poligonais_importadas',
        status: 'ativo',
        propriedades: Object.keys(f.propriedades).length ? f.propriedades : null,
        fonte_arquivo: String(imp.mapeamento?.arquivo ?? '').slice(0, 200) || null,
        fonte_crs: 'EPSG:4326',
        importado_em: new Date().toISOString(),
        importacao_id: imp.id,
      });
      inseridas++;
    }
  });
  const final = await req.dados!.atualizar('importacoes', imp.id, {
    status: 'aplicada', aplicada_em: new Date().toISOString(), inseridas, ignoradas, rejeitadas: rejeicoes.length, atualizadas: 0,
    relatorio: { rejeicoes },
  });
  return { ...final, rejeicoes };
}
