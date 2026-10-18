import { Router, type Request } from 'express';
import { derivadosAnuncio, estagioDoStatus, grupoDaCategoria, orientacao, TIPOS_IMOVEL, urlCanonica } from '../../comum/anuncios';
import { coordenada, numero, slug as slugDe, urlSegura } from '../../comum/normalizar';
import { errosUrlBase } from '../importacao/tabelas';
import { ErroApp, textoQuery } from './comum';
import { anexarLocalidade, conferir, faixa, rotasCadastro, type DefCadastro } from './cadastro-fabrica';
import { cidadeDoRequest } from './territorio-comum';

type Linha = Record<string, any>;

/** `?localidade=` aceita id, código (`RA_01`) ou código legado. */
async function localidadeDaQuery(req: Request): Promise<number | null | undefined> {
  const v = textoQuery(req, 'localidade');
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return Number(v);
  const cidade = await cidadeDoRequest(req);
  const r = await req.dados!.listar('localidades', { filtros: { cidade_id: cidade.id, codigo: v.toUpperCase() }, por_pagina: 1 });
  if (r.dados[0]) return r.dados[0].id;
  const l = await req.dados!.listar('localidades', { filtros: { cidade_id: cidade.id, codigo_legado: v.toUpperCase() }, por_pagina: 1 });
  return l.dados[0]?.id ?? null;
}

function lista(v: string | undefined): string[] | undefined {
  return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
}

/** Bbox `o,s,l,n` sobre latitude/longitude, como filtro de faixa. */
function bboxPonto(req: Request, filtros: Record<string, unknown>): void {
  const t = textoQuery(req, 'bbox');
  if (!t) return;
  const n = t.split(',').map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) throw new ErroApp(400, 'BBOX_INVALIDA', 'bbox deve ser oeste,sul,leste,norte.');
  Object.assign(filtros, { 'longitude[gte]': n[0], 'latitude[gte]': n[1], 'longitude[lte]': n[2], 'latitude[lte]': n[3] });
}

function errosNumeros(dados: Linha, campos: string[]): string[] {
  const erros: string[] = [];
  for (const c of campos) {
    if (dados[c] === undefined || dados[c] === null) continue;
    const n = numero(dados[c]);
    if (n === null || n < 0) erros.push(`${c}: número não negativo.`);
    else dados[c] = n;
  }
  return erros;
}

async function exigirLocalidadeId(req: Request, id: unknown): Promise<Linha> {
  const loc = await req.dados!.buscar('localidades', Number(id));
  if (!loc) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Localidade inexistente.', ['localidade_id não corresponde a uma localidade.']);
  return loc;
}

// ------------------------------------------------------------------ anúncios

/** Filtros da lista de anúncios: o vocabulário fechado da tela e do site (spec 6.2, 10.1). */
export async function filtrosAnuncios(req: Request): Promise<{ filtros: Record<string, unknown>; busca?: string; buscaColunas?: string[] }> {
  const filtros: Record<string, unknown> = {};
  const loc = await localidadeDaQuery(req);
  if (loc !== undefined) filtros.localidade_id = loc ?? -1;
  const tipos = lista(textoQuery(req, 'tipo_imovel'));
  const ori = textoQuery(req, 'orientacao');
  const porOrientacao = ori ? TIPOS_IMOVEL.filter((t) => orientacao(t) === ori) : undefined;
  const tiposFinal = tipos && porOrientacao ? tipos.filter((t) => porOrientacao.includes(t as never)) : tipos ?? porOrientacao;
  if (tiposFinal) filtros.tipo_imovel = tiposFinal.length ? tiposFinal : ['__nenhum__'];
  const transacao = textoQuery(req, 'tipo_transacao');
  if (transacao) filtros.tipo_transacao = transacao;
  const status = textoQuery(req, 'status') ?? 'ativo';
  if (status !== 'todos') filtros.status = status;
  const portal = textoQuery(req, 'portal');
  if (portal) filtros.portal = portal;
  const sit = textoQuery(req, 'situacao_regularizacao');
  if (sit) filtros.situacao_regularizacao = sit;
  const fonte = textoQuery(req, 'fonte_id');
  if (fonte) filtros.fonte_id = fonte;
  faixa(req, filtros, 'quartos_min', 'quartos_max', 'quartos');
  faixa(req, filtros, 'preco_min', 'preco_max', 'preco_pedido_brl');
  faixa(req, filtros, 'area_min', 'area_max', 'area_m2');
  bboxPonto(req, filtros);
  return { filtros, busca: textoQuery(req, 'q'), buscaColunas: ['titulo', 'endereco', 'localidade_texto'] };
}

const CAMPOS_ANUNCIO = [
  'fonte_id', 'tipo_transacao', 'titulo', 'url_fonte', 'id_externo', 'codigo_portal', 'status', 'localidade_id', 'endereco',
  'localidade_texto', 'latitude', 'longitude', 'precisao_coordenada', 'confianca', 'tipo_imovel', 'preco_pedido_brl', 'area_m2',
  'base_area', 'preco_m2_informado_brl', 'quartos', 'suites', 'vagas', 'condominio_brl', 'iptu_brl', 'qualidade',
  'situacao_regularizacao', 'observado_em', 'visto_em', 'caracteristicas', 'dias_publicado',
] as const;

async function prepararAnuncio(req: Request, dados: Linha, atual: Linha | null): Promise<Linha> {
  const erros = errosNumeros(dados, ['preco_pedido_brl', 'area_m2', 'preco_m2_informado_brl', 'quartos', 'suites', 'vagas', 'condominio_brl', 'iptu_brl', 'dias_publicado']);
  if (dados.preco_pedido_brl === 0) dados.preco_pedido_brl = null;
  if (dados.url_fonte !== undefined) {
    const u = urlSegura(dados.url_fonte);
    if (!u) erros.push('url_fonte: só http ou https.');
    else dados.url_fonte = urlCanonica(u);
  }
  if (dados.tipo_imovel !== undefined && !TIPOS_IMOVEL.includes(dados.tipo_imovel)) erros.push('tipo_imovel: valor fora do vocabulário.');
  if (dados.fonte_id !== undefined) {
    const fonte = await req.dados!.buscar('fontes_portal', Number(dados.fonte_id));
    if (!fonte) erros.push('fonte_id: fonte inexistente.');
    else dados.portal = fonte.nome;
  }
  const loc = dados.localidade_id !== undefined ? await exigirLocalidadeId(req, dados.localidade_id) : null;
  if (dados.latitude !== undefined || dados.longitude !== undefined) {
    const c = coordenada(dados.latitude ?? atual?.latitude, dados.longitude ?? atual?.longitude);
    if (!c) erros.push('latitude/longitude: par fora da faixa ou incompleto.');
    else if (dados.precisao_coordenada === undefined) dados.precisao_coordenada = 'manual';
  }
  conferir(erros);
  if (!atual) {
    // Formulário sem coordenada: ponto de referência da localidade, rotulado como aproximado.
    if (dados.latitude === undefined || dados.latitude === null) {
      const lat = numero(loc?.ponto_referencia_latitude);
      const lon = numero(loc?.ponto_referencia_longitude);
      if (lat === null || lon === null) conferir(['latitude/longitude: informe a coordenada (a localidade não tem ponto de referência).']);
      Object.assign(dados, { latitude: lat, longitude: lon, precisao_coordenada: 'centroide_localidade_jitter_deterministico' });
    }
    const agora = new Date().toISOString();
    Object.assign(dados, {
      status: dados.status ?? 'ativo',
      localidade_texto: dados.localidade_texto ?? loc?.nome,
      confianca: dados.confianca ?? 'cadastro_manual',
      qualidade: dados.qualidade ?? 'cadastro_manual',
      origem_cadastro: 'manual_formulario',
      primeiro_visto_em: agora,
      observado_em: dados.observado_em ?? agora.slice(0, 10),
      preco_inicial_brl: dados.preco_pedido_brl ?? null,
    });
  } else {
    if (dados.preco_pedido_brl !== undefined && Number(dados.preco_pedido_brl) !== Number(atual.preco_pedido_brl)) dados.preco_alterado_em = new Date().toISOString();
    if (dados.status === 'inativo' && atual.status !== 'inativo') dados.inativo_em = new Date().toISOString();
    if (dados.status === 'ativo' && atual.status === 'inativo') dados.inativo_em = null;
  }
  return dados;
}

export const DEF_ANUNCIOS: DefCadastro = {
  objeto: 'anuncio',
  tabela: 'anuncios',
  base: '/anuncios',
  camposCriar: CAMPOS_ANUNCIO,
  camposEditar: CAMPOS_ANUNCIO,
  obrigatoriosCriar: ['fonte_id', 'tipo_transacao', 'titulo', 'url_fonte', 'localidade_id', 'tipo_imovel'],
  colunasCsv: [
    'id', 'id_legado', 'portal', 'tipo_transacao', 'titulo', 'url_fonte', 'status', 'localidade_id', 'localidade_nome', 'localidade_texto',
    'endereco', 'latitude', 'longitude', 'precisao_coordenada', 'confianca', 'tipo_imovel', 'orientacao', 'preco_pedido_brl', 'area_m2',
    'base_area', 'preco_m2_informado_brl', 'preco_m2', 'preco_m2_divergente', 'quartos', 'suites', 'vagas', 'condominio_brl', 'iptu_brl',
    'qualidade', 'situacao_regularizacao', 'observado_em', 'visto_em', 'primeiro_visto_em', 'origem_cadastro', 'versao',
  ],
  ordenar: { coluna: 'observado_em', ordem: 'desc' },
  filtros: filtrosAnuncios,
  preparar: prepararAnuncio,
  derivar: derivadosAnuncio,
  anexar: anexarLocalidade,
  eventos: {
    tabela: 'anuncio_eventos',
    fk: 'anuncio_id',
    aoCriar: (a) => ({ tipo: 'criado', status_novo: a.status, preco_novo_brl: a.preco_pedido_brl }),
    aoEditar: (antes, depois, campos) => {
      if (campos.includes('status') && antes.status !== depois.status) {
        return { tipo: depois.status === 'inativo' ? 'inativo_confirmado' : 'reativado', status_anterior: antes.status, status_novo: depois.status, campos_alterados: campos };
      }
      if (campos.includes('preco_pedido_brl')) {
        return { tipo: 'preco_alterado', preco_anterior_brl: antes.preco_pedido_brl, preco_novo_brl: depois.preco_pedido_brl, campos_alterados: campos };
      }
      return { tipo: 'corrigido_manualmente', campos_alterados: campos };
    },
    aoRemover: () => ({ tipo: 'removido' }),
    aoRestaurar: () => ({ tipo: 'restaurado' }),
  },
  async ficha(req, a) {
    // Retratos, grupo, liquidez e preço inicial confirmado pela coleta são da fase 3 (T10).
    const futuro = { motivo: 'fase_futura', fase: '3' };
    const eventos = await req.dados!.listar('anuncio_eventos', { filtros: { anuncio_id: a.id }, ordenar: 'ocorrido_em', ordem: 'desc', por_pagina: 50 });
    return { eventos: eventos.dados, retratos: null, grupo: null, liquidez: null, indisponivel: { retratos: futuro, grupo: futuro, liquidez: futuro } };
  },
};

// --------------------------------------------------------------- lançamentos

const CAMPOS_LANCAMENTO = [
  'nome', 'incorporadora', 'endereco', 'latitude', 'longitude', 'precisao_coordenada', 'status_coordenada', 'localidade_id', 'bairro_texto',
  'produto', 'segmento', 'status', 'estagio_vendas', 'unidades_total', 'area_min_m2', 'area_max_m2', 'preco_atual_brl', 'preco_m2_atual_brl',
  'url_fonte', 'confianca', 'qualidade', 'verificado_em', 'obra_frac', 'mix_unidades', 'entrega_prevista', 'orientacao',
  'situacao_regularizacao', 'unidades_estoque', 'unidades_prontas_estoque',
] as const;

async function prepararLancamento(req: Request, dados: Linha, atual: Linha | null): Promise<Linha> {
  const erros = errosNumeros(dados, ['unidades_total', 'area_min_m2', 'area_max_m2', 'preco_atual_brl', 'preco_m2_atual_brl', 'unidades_estoque', 'unidades_prontas_estoque']);
  if (dados.obra_frac !== undefined && dados.obra_frac !== null) {
    const n = numero(dados.obra_frac);
    if (n === null || n < 0 || n > 1) erros.push('obra_frac: fração entre 0 e 1 (0,4 = 40%).');
    else dados.obra_frac = n;
  }
  if (dados.url_fonte) {
    const u = urlSegura(dados.url_fonte);
    if (!u) erros.push('url_fonte: só http ou https.');
    else dados.url_fonte = u;
  }
  if (dados.localidade_id) await exigirLocalidadeId(req, dados.localidade_id);
  if (dados.latitude !== undefined || dados.longitude !== undefined) {
    const c = coordenada(dados.latitude ?? atual?.latitude, dados.longitude ?? atual?.longitude);
    if (!c && (dados.latitude !== null || dados.longitude !== null)) erros.push('latitude/longitude: par fora da faixa ou incompleto.');
    dados.espacial_utilizavel = Boolean(c);
  }
  conferir(erros);
  if (!atual) {
    Object.assign(dados, {
      confianca: dados.confianca ?? 'cadastro_manual',
      verificado_em: dados.verificado_em ?? new Date().toISOString().slice(0, 10),
      primeiro_visto_em: new Date().toISOString(),
      espacial_utilizavel: dados.espacial_utilizavel ?? false,
      estagio_vendas: dados.estagio_vendas ?? estagioDoStatus(dados.status),
    });
  }
  return dados;
}

export const DEF_LANCAMENTOS: DefCadastro = {
  objeto: 'lancamento',
  tabela: 'lancamentos',
  base: '/lancamentos',
  camposCriar: CAMPOS_LANCAMENTO,
  camposEditar: CAMPOS_LANCAMENTO,
  obrigatoriosCriar: ['nome', 'bairro_texto'],
  colunasCsv: ['id', 'id_legado', ...CAMPOS_LANCAMENTO, 'localidade_nome', 'espacial_utilizavel', 'lacunas', 'versao'],
  ordenar: { coluna: 'nome', ordem: 'asc' },
  async filtros(req) {
    const filtros: Record<string, unknown> = {};
    const loc = await localidadeDaQuery(req);
    if (loc !== undefined) filtros.localidade_id = loc ?? -1;
    for (const k of ['estagio_vendas', 'orientacao', 'segmento']) {
      const v = textoQuery(req, k);
      if (v) filtros[k] = v;
    }
    if (textoQuery(req, 'espacial') === 'sim') filtros.espacial_utilizavel = true;
    bboxPonto(req, filtros);
    return { filtros, busca: textoQuery(req, 'q'), buscaColunas: ['nome', 'incorporadora', 'bairro_texto'] };
  },
  preparar: prepararLancamento,
  derivar: (l) => ({
    preco_m2_calculado: numero(l.preco_atual_brl) && numero(l.area_min_m2) ? Math.round((numero(l.preco_atual_brl)! / numero(l.area_min_m2)!) * 100) / 100 : null,
  }),
  anexar: anexarLocalidade,
  eventos: {
    tabela: 'lancamento_eventos',
    fk: 'lancamento_id',
    aoCriar: (l) => ({ tipo: 'criado', status_novo: l.status }),
    aoEditar: (antes, depois, campos) =>
      campos.includes('preco_atual_brl')
        ? { tipo: 'preco_alterado', preco_anterior_brl: antes.preco_atual_brl, preco_novo_brl: depois.preco_atual_brl, campos_alterados: campos }
        : { tipo: 'corrigido_manualmente', campos_alterados: campos },
    aoRemover: () => ({ tipo: 'removido' }),
    aoRestaurar: () => ({ tipo: 'restaurado' }),
  },
  async ficha(req, l) {
    const eventos = await req.dados!.listar('lancamento_eventos', { filtros: { lancamento_id: l.id }, ordenar: 'ocorrido_em', ordem: 'desc', por_pagina: 50 });
    return { eventos: eventos.dados };
  },
};

// ------------------------------------------------------------------- âncoras

const CAMPOS_ANCORA = [
  'nome', 'categoria', 'subcategoria', 'grupo', 'segmento', 'operador', 'marca', 'endereco', 'latitude', 'longitude', 'precisao_coordenada',
  'confianca', 'localidade_id', 'bairro_texto', 'url_fonte', 'url_fonte_coordenada', 'verificado_em', 'status', 'escala_capacidade', 'area_ocupada_m2',
] as const;

async function prepararAncora(req: Request, dados: Linha, atual: Linha | null): Promise<Linha> {
  const erros = errosNumeros(dados, ['area_ocupada_m2']);
  for (const c of ['url_fonte', 'url_fonte_coordenada']) {
    if (dados[c] === undefined || dados[c] === null) continue;
    const u = urlSegura(dados[c]);
    if (!u) erros.push(`${c}: só http ou https.`);
    else dados[c] = u;
  }
  if (dados.localidade_id) await exigirLocalidadeId(req, dados.localidade_id);
  if (dados.latitude !== undefined || dados.longitude !== undefined) {
    if (!coordenada(dados.latitude ?? atual?.latitude, dados.longitude ?? atual?.longitude)) erros.push('latitude/longitude: par fora da faixa ou incompleto.');
  }
  conferir(erros);
  if (!atual) {
    Object.assign(dados, {
      grupo: dados.grupo ?? grupoDaCategoria(dados.categoria),
      precisao_coordenada: dados.precisao_coordenada ?? 'manual',
      confianca: dados.confianca ?? 'cadastro_manual',
      url_fonte_coordenada: dados.url_fonte_coordenada ?? dados.url_fonte,
      verificado_em: dados.verificado_em ?? new Date().toISOString().slice(0, 10),
      status: dados.status ?? 'ativa',
    });
  }
  return dados;
}

export const DEF_ANCORAS: DefCadastro = {
  objeto: 'ancora',
  tabela: 'ancoras',
  base: '/ancoras',
  camposCriar: CAMPOS_ANCORA,
  camposEditar: CAMPOS_ANCORA,
  obrigatoriosCriar: ['nome', 'categoria', 'subcategoria', 'operador', 'latitude', 'longitude', 'url_fonte'],
  colunasCsv: ['id', 'id_legado', ...CAMPOS_ANCORA, 'localidade_nome', 'versao'],
  ordenar: { coluna: 'nome', ordem: 'asc' },
  async filtros(req) {
    const filtros: Record<string, unknown> = {};
    for (const k of ['categoria', 'grupo', 'segmento', 'status']) {
      const v = textoQuery(req, k);
      if (v) filtros[k] = lista(v);
    }
    const loc = await localidadeDaQuery(req);
    if (loc !== undefined) filtros.localidade_id = loc ?? -1;
    bboxPonto(req, filtros);
    return { filtros, busca: textoQuery(req, 'q'), buscaColunas: ['nome', 'operador', 'marca'] };
  },
  preparar: prepararAncora,
  anexar: anexarLocalidade,
};

// -------------------------------------------------------------------- fontes

const CAMPOS_FONTE = ['slug', 'nome', 'tipo', 'ativa', 'frequencia', 'url_base', 'parser', 'config_parser', 'cabecalhos', 'notas'] as const;
const CABECALHOS_PERMITIDOS = ['accept', 'accept-language', 'referer'];

async function prepararFonte(_req: Request, dados: Linha, atual: Linha | null): Promise<Linha> {
  const erros: string[] = [];
  if (dados.url_base !== undefined) erros.push(...errosUrlBase(String(dados.url_base)));
  if (dados.cabecalhos !== undefined && dados.cabecalhos !== null) {
    if (typeof dados.cabecalhos !== 'object' || Array.isArray(dados.cabecalhos)) erros.push('cabecalhos: objeto { nome: valor }.');
    else for (const k of Object.keys(dados.cabecalhos)) if (!CABECALHOS_PERMITIDOS.includes(k.toLowerCase())) erros.push(`cabecalhos: "${k}" não é permitido (só Accept, Accept-Language, Referer).`);
  }
  if (erros.length) throw new ErroApp(422, 'FONTE_CONFIG_INVALIDA', 'Configuração da fonte recusada.', erros);
  if (!atual) {
    const s = slugDe(dados.slug ?? dados.nome);
    Object.assign(dados, { slug: /^[a-z]/.test(s) ? s : `f_${s}`, tipo: dados.tipo ?? 'portal', estado: 'sem_dado', frequencia: dados.frequencia ?? 'manual', parser: dados.parser ?? 'generico_html' });
  }
  return dados;
}

export const DEF_FONTES: DefCadastro = {
  tabela: 'fontes_portal',
  base: '/fontes',
  papelEscrita: 'operador',
  camposCriar: CAMPOS_FONTE,
  camposEditar: CAMPOS_FONTE.filter((c) => c !== 'slug'),
  obrigatoriosCriar: ['nome', 'url_base'],
  colunasCsv: ['id', ...CAMPOS_FONTE, 'estado', 'versao'],
  ordenar: { coluna: 'nome', ordem: 'asc' },
  async filtros(req) {
    const filtros: Record<string, unknown> = {};
    const ativa = textoQuery(req, 'ativa');
    if (ativa) filtros.ativa = ativa === 'true';
    return { filtros, busca: textoQuery(req, 'q'), buscaColunas: ['nome', 'slug'] };
  },
  preparar: prepararFonte,
};

export const mercadoCadastro: Router = Router();
mercadoCadastro.use(rotasCadastro(DEF_ANUNCIOS));
mercadoCadastro.use(rotasCadastro(DEF_LANCAMENTOS));
mercadoCadastro.use(rotasCadastro(DEF_ANCORAS));
mercadoCadastro.use(rotasCadastro(DEF_FONTES));
