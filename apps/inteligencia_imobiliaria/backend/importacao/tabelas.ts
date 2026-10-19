import { createHash } from 'node:crypto';
import type { HelperDados } from '@urbiverso/sdk';
import { caixa, geometriaCanonica, metricas, validarGeometria, type Geometria } from '../../comum/geo';
import { chaveNome, coordenada, precoM2, slug as slugDe, urlSegura } from '../../comum/normalizar';
import { estagioDoStatus, grupoDaCategoria, urlCanonica } from '../../comum/anuncios';
import type { ErroLinha } from './converter';
import { podeEscreverArea, podeLerArea, type Ator } from '../../comum/regras-objeto';

/** Achado de qualidade não bloqueante, gravado depois de aplicar (spec 5.11). */
export interface AchadoNovo {
  codigo: string;
  severidade: 'erro' | 'aviso' | 'info';
  campo?: string;
  mensagem: string;
  valor?: string;
}

export interface CtxImportacao {
  dados: HelperDados;
  usuarioId: number;
  cidadeId: number;
  /** Cache por processo de importação (localidades, existentes…). */
  cache: Map<string, unknown>;
  /** Papéis de quem importa: linha de área própria só entra para o curador (11.5). */
  papeis?: { curador: boolean };
  /** Quem importa, para a regra por objeto (áreas de estudo, 15.1b). */
  ator?: Ator;
}

export interface LinhaPreparada {
  dados: Record<string, unknown>;
  achados: AchadoNovo[];
}

export interface GanchosTabela {
  /** Carrega o que a resolução de referências precisa, uma vez por importação. */
  carregar?(ctx: CtxImportacao): Promise<void>;
  /** Resolve referências e deriva colunas; acumula erros que rejeitam a linha. */
  preparar(valores: Record<string, unknown>, ctx: CtxImportacao, erros: ErroLinha[]): Promise<LinhaPreparada>;
  /** Chave natural da linha preparada (ou da existente), para duplicata. */
  chave(dados: Record<string, unknown>): string | null;
  /**
   * Todas as chaves pelas quais a linha pode casar com uma existente (ex.:
   * `id_legado` e a URL). Ausente = só a `chave`. A existente é indexada por
   * todas; a linha do CSV procura por todas, na ordem.
   */
  chaves?(dados: Record<string, unknown>): string[];
  /** Linha existente que quem importa pode enxergar; a invisível não casa nem é citada (sigilo, D-116). */
  visivel?(existente: Record<string, any>, ctx: CtxImportacao): boolean;
  /** Recusa a atualização de uma existente que quem importa não pode editar (regra por objeto). */
  conferirAtualizacao?(existente: Record<string, any>, ctx: CtxImportacao): ErroLinha | null;
  /** Recusa já na prévia a linha nova que o banco recusaria (ex.: área sem geometria). */
  conferirNovo?(dados: Record<string, unknown>): ErroLinha | null;
  /** Colunas derivadas que mudam junto quando o modo `atualizar` toca uma coluna de origem. */
  derivadasDe?: Record<string, string[]>;
  /** Na transação do lote, depois de criar a linha (ex.: o evento `criado` do anúncio). */
  aposCriar?(trx: HelperDados, criado: Record<string, any>, ctx: CtxImportacao): Promise<void>;
  /** Só no aplicar, antes dos lotes: cria o que a prévia só apontou (ex.: fonte nova do portal). */
  antesDeAplicar?(linhas: { dados: Record<string, unknown> }[], ctx: CtxImportacao): Promise<void>;
}

// ---------------------------------------------------------------------------
// Localidades: resolução por código, código legado ou nome (spec 5.3, 11.3).

interface LocalidadeCache {
  porCodigo: Map<string, Record<string, any>>;
}

export async function carregarLocalidades(ctx: CtxImportacao, recarregar = false): Promise<LocalidadeCache> {
  if (!recarregar && ctx.cache.has('localidades')) return ctx.cache.get('localidades') as LocalidadeCache;
  const linhas = await ctx.dados.varrerTudo('localidades', { filtros: { cidade_id: ctx.cidadeId } });
  const porCodigo = new Map<string, Record<string, any>>();
  for (const l of linhas) {
    porCodigo.set(`ID:${l.id}`, l);
    for (const k of [l.codigo, l.codigo_legado, l.codigo_romano]) if (k) porCodigo.set(String(k).toUpperCase(), l);
  }
  // Nome só resolve quando é único (há RA e submercado com o mesmo nome).
  const nomes = new Map<string, Record<string, any>[]>();
  for (const l of linhas) for (const n of [l.nome, l.nome_fonte]) if (n) nomes.set(chaveNome(n), [...(nomes.get(chaveNome(n)) ?? []), l]);
  for (const [n, ls] of nomes) if (ls.length === 1 && !porCodigo.has(`NOME:${n}`)) porCodigo.set(`NOME:${n}`, ls[0]);
  const cache = { porCodigo };
  ctx.cache.set('localidades', cache);
  return cache;
}

export function resolverLocalidade(cache: LocalidadeCache, valor: unknown): Record<string, any> | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const t = String(valor).trim();
  if (/^\d+$/.test(t)) return cache.porCodigo.get(`ID:${t}`) ?? null;
  return cache.porCodigo.get(t.toUpperCase()) ?? cache.porCodigo.get(`NOME:${chaveNome(t)}`) ?? null;
}

async function exigirLocalidade(ctx: CtxImportacao, valor: unknown, coluna: string, erros: ErroLinha[], obrigatoria: boolean): Promise<number | null> {
  if (valor === null || valor === undefined || valor === '') {
    if (obrigatoria) erros.push({ coluna, codigo: 'OBRIGATORIO', mensagem: 'localidade obrigatória' });
    return null;
  }
  const loc = resolverLocalidade(await carregarLocalidades(ctx), valor);
  if (!loc) {
    erros.push({ coluna, codigo: 'LOCALIDADE_NAO_RESOLVIDA', mensagem: `"${String(valor)}" não corresponde a nenhuma localidade (código, código legado ou nome)` });
    return null;
  }
  return Number(loc.id);
}

/** Tipo da localidade: RA pelo código; da classificação do FipeZap; senão bairro. */
function tipoDaLocalidade(v: Record<string, unknown>): string {
  if (/^RA_\d+$/i.test(String(v.codigo ?? ''))) return 'ra';
  const c = String(v.classificacao_fonte ?? '').toUpperCase();
  if (c === 'AGREGADO_DF') return 'agregado';
  if (c.includes('FIPE')) return 'submercado';
  return 'bairro';
}

/** `ASA SUL` → `Asa Sul` (o nome da fonte fica intacto em `nome_fonte`). */
function nomeLegivel(t: string): string {
  return t.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());
}

const localidades: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade_pai;
    delete dados.localidade_predecessora;
    dados.cidade_id = ctx.cidadeId;
    if (!dados.tipo) dados.tipo = tipoDaLocalidade(v);
    if (!dados.nome && v.nome_fonte) dados.nome = nomeLegivel(String(v.nome_fonte));
    if ('localidade_pai' in v) dados.localidade_pai_id = await exigirLocalidade(ctx, v.localidade_pai, 'localidade_pai', erros, false);
    if ('localidade_predecessora' in v) dados.localidade_predecessora_id = await exigirLocalidade(ctx, v.localidade_predecessora, 'localidade_predecessora', erros, false);
    return { dados, achados: [] };
  },
  chave: (d) => (d.tipo && d.codigo ? `${d.tipo}|${String(d.codigo).toUpperCase()}` : null),
};

// ---------------------------------------------------------------------------
// Perfis: uma linha por localidade e ano; faixas etárias somam ~1 (spec 5.3).

const FAIXAS = ['faixa_0_14_frac', 'faixa_15_29_frac', 'faixa_30_44_frac', 'faixa_45_59_frac', 'faixa_60_mais_frac'];

const localidadePerfis: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade;
    dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, true);
    const achados: AchadoNovo[] = [];
    if (typeof v.renda_per_capita_brl === 'number' && v.renda_per_capita_brl < 0) {
      erros.push({ coluna: 'renda_per_capita_brl', codigo: 'NUMERO_INVALIDO', mensagem: 'renda negativa' });
    }
    const faixas = FAIXAS.map((f) => v[f]).filter((x): x is number => typeof x === 'number');
    if (faixas.length === FAIXAS.length) {
      const soma = faixas.reduce((s, x) => s + x, 0);
      if (soma < 0.98 || soma > 1.02) {
        achados.push({ codigo: 'SOMA_FAIXAS_ETARIAS', severidade: 'aviso', campo: 'faixa_*_frac', mensagem: `As cinco faixas etárias somam ${soma.toFixed(3)}, fora de [0,98; 1,02].`, valor: soma.toFixed(4) });
      }
    }
    return { dados, achados };
  },
  chave: (d) => (d.localidade_id && d.ano_referencia ? `${d.localidade_id}|${d.ano_referencia}` : null),
};

// ---------------------------------------------------------------------------
// Contornos: geometria validada, caixa, métricas e hash na escrita (spec 5.3).

export function hashGeometria(g: Geometria): string {
  return createHash('sha256').update(geometriaCanonica(g)).digest('hex');
}

/** Colunas derivadas da geometria de um contorno ou área. */
export function derivarGeometria(g: Geometria): Record<string, unknown> {
  const cx = caixa(g);
  const m = metricas(g);
  return {
    geometria_tipo: g.type,
    bbox_oeste: cx.oeste,
    bbox_sul: cx.sul,
    bbox_leste: cx.leste,
    bbox_norte: cx.norte,
    centroide_latitude: m.centroide.lat,
    centroide_longitude: m.centroide.lon,
    area_m2: m.area_m2 === null ? null : Math.round(m.area_m2 * 100) / 100,
    area_ha: m.area_m2 === null ? null : Math.round(m.area_m2) / 10000,
    perimetro_m: m.perimetro_m === null ? null : Math.round(m.perimetro_m * 100) / 100,
    metricas_aproximadas: true,
    geometria_hash: hashGeometria(g),
  };
}

/** Estilo da planilha (`fill_color`…) no formato `EstiloFeicao` do `urbi-mapa` (D-87). */
export function estiloDaPlanilha(v: Record<string, unknown>, tipoGeometria: string): Record<string, unknown> | null {
  const estilo: Record<string, unknown> = {};
  if (v.preenchimento) estilo.preenchimento = v.preenchimento;
  if (typeof v.opacidade_preenchimento === 'number') estilo.opacidadePreenchimento = v.opacidade_preenchimento;
  if (v.contorno_cor) estilo.contorno = v.contorno_cor;
  if (typeof v.espessura === 'number') estilo.espessura = v.espessura;
  if (v.cor) estilo[tipoGeometria.includes('Line') ? 'contorno' : 'preenchimento'] = v.cor;
  return Object.keys(estilo).length ? estilo : null;
}

const contornos: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    for (const k of ['localidade', 'preenchimento', 'contorno_cor', 'opacidade_preenchimento', 'espessura', 'cor']) delete dados[k];
    if ('localidade' in v) dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, false);
    const g = v.geometria as Geometria | null;
    if (g) {
      const problemas = validarGeometria(g);
      if (problemas.length) erros.push({ coluna: 'geometria', codigo: 'POLIGONO_INVALIDO', mensagem: problemas.join('; ') });
      else {
        const derivadas = derivarGeometria(g);
        Object.assign(dados, derivadas, {
          centroide_latitude: v.centroide_latitude ?? derivadas.centroide_latitude,
          centroide_longitude: v.centroide_longitude ?? derivadas.centroide_longitude,
        });
      }
    }
    if (!v.estilo) {
      const estilo = estiloDaPlanilha(v, String(dados.geometria_tipo ?? ''));
      if (estilo) dados.estilo = estilo;
    }
    dados.tipo_entidade = v.tipo_entidade ?? 'area_personalizada';
    dados.papel_geometria = v.papel_geometria ?? (String(dados.geometria_tipo ?? '').includes('Line') ? 'eixo_rota' : 'limite_exibicao');
    dados.grupo_camada = v.grupo_camada ?? (dados.tipo_entidade === 'regiao_administrativa' ? 'administrative_regions' : 'poligonais_importadas');
    dados.status = v.status ?? 'ativo';
    return { dados, achados: [] };
  },
  chave: (d) => (d.id_legado ? `legado|${d.id_legado}` : d.geometria_hash ? `geo|${d.tipo_entidade}|${d.entidade_codigo ?? ''}|${d.geometria_hash}` : null),
  chaves: (d) => [d.id_legado ? `legado|${d.id_legado}` : '', d.geometria_hash ? `geo|${d.tipo_entidade}|${d.entidade_codigo ?? ''}|${d.geometria_hash}` : ''].filter(Boolean),
  derivadasDe: { geometria: ['geometria_tipo', 'bbox_oeste', 'bbox_sul', 'bbox_leste', 'bbox_norte', 'area_m2', 'area_ha', 'perimetro_m', 'metricas_aproximadas', 'geometria_hash', 'centroide_latitude', 'centroide_longitude'] },
};

// ---------------------------------------------------------------------------
// Fontes (portais): a guarda de destino da coleta começa no cadastro (spec 8.2).

const HOSTS_PROIBIDOS = /^(localhost|.*\.local|.*\.internal)$/i;

/** Erros de `url_base` de fonte: só http(s) na porta padrão, sem IP literal nem host interno. */
export function errosUrlBase(url: string): string[] {
  try {
    const u = new URL(url);
    const erros: string[] = [];
    if (u.protocol !== 'http:' && u.protocol !== 'https:') erros.push('url_base: só http ou https');
    if (u.port) erros.push('url_base: só na porta padrão');
    if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || u.hostname.startsWith('[')) erros.push('url_base: IP literal não é aceito');
    if (HOSTS_PROIBIDOS.test(u.hostname)) erros.push('url_base: host interno não é aceito');
    return erros;
  } catch {
    return ['url_base: URL inválida'];
  }
}

async function carregarFontes(ctx: CtxImportacao, recarregar = false): Promise<Map<string, Record<string, any>>> {
  if (!recarregar && ctx.cache.has('fontes')) return ctx.cache.get('fontes') as Map<string, Record<string, any>>;
  const mapa = new Map<string, Record<string, any>>();
  for (const f of await ctx.dados.varrerTudo('fontes_portal')) {
    mapa.set(chaveNome(f.nome), f);
    mapa.set(chaveNome(f.slug), f);
  }
  ctx.cache.set('fontes', mapa);
  return mapa;
}

const fontesPortal: GanchosTabela = {
  async preparar(v, _ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    dados.slug = v.slug ? slugDe(String(v.slug).replace(/^SRC_PORTAL_/i, '')) : slugDe(v.nome);
    if (!/^[a-z]/.test(String(dados.slug))) dados.slug = `f_${dados.slug}`;
    if (v.url_base) for (const e of errosUrlBase(String(v.url_base))) erros.push({ coluna: 'url_base', codigo: 'FONTE_CONFIG_INVALIDA', mensagem: e });
    dados.tipo = v.tipo ?? 'portal';
    return { dados, achados: [] };
  },
  chave: (d) => (d.slug ? String(d.slug) : null),
};

// ---------------------------------------------------------------------------
// Anúncios (spec 5.4; migração passo 7).

const anuncios: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
    await carregarFontes(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    // Célula vazia não vira null em coluna obrigatória com padrão no schema: sem a chave, vale o padrão.
    for (const k of ['ultimo_status_verificacao', 'falhas_verificacao']) if (dados[k] == null) delete dados[k];
    delete dados.localidade;
    // CSV parcial no modo `atualizar`: só confere a coluna que veio (a linha nova sem ela é recusada pelo motor).
    if ('localidade' in v) dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, true);
    if (v.portal !== null && v.portal !== undefined && v.portal !== '') {
      const fonte = (await carregarFontes(ctx)).get(chaveNome(v.portal));
      dados.fonte_id = fonte ? Number(fonte.id) : null;
      if (!fonte) dados.__fonte_nova = String(v.portal);
    }
    if (v.url_fonte) dados.url_fonte = urlCanonica(String(v.url_fonte));
    if ((v.latitude !== null && v.latitude !== undefined) || (v.longitude !== null && v.longitude !== undefined)) {
      if (!coordenada(v.latitude, v.longitude)) erros.push({ coluna: 'latitude', codigo: 'COORDENADA_INVALIDA', mensagem: 'par de coordenadas fora da faixa ou incompleto' });
    }
    if (typeof v.preco_pedido_brl === 'number' && v.preco_pedido_brl <= 0) dados.preco_pedido_brl = null;
    // Ponto único ambíguo ("385.000" lido como 385): a âncora preço/m² informado × área decide (site, toPriceNumber).
    if (typeof dados.preco_pedido_brl === 'number' && dados.preco_pedido_brl < 100_000 && typeof v.area_m2 === 'number' && typeof v.preco_m2_informado_brl === 'number' && v.area_m2 > 0) {
      const esperado = v.preco_m2_informado_brl * v.area_m2;
      if (Math.abs(dados.preco_pedido_brl * 1000 - esperado) < Math.abs(dados.preco_pedido_brl - esperado)) dados.preco_pedido_brl *= 1000;
    }
    dados.status = v.status ?? 'ativo';
    dados.origem_cadastro = 'importacao';
    dados.primeiro_visto_em = v.primeiro_visto_em ?? (v.observado_em ? `${v.observado_em}T00:00:00.000Z` : new Date().toISOString());
    dados.preco_inicial_brl = dados.preco_pedido_brl ?? null;
    const achados: AchadoNovo[] = [];
    const c = precoM2(dados.preco_pedido_brl, v.area_m2, v.preco_m2_informado_brl);
    if (c.divergente) {
      achados.push({ codigo: 'PRECO_M2_DIVERGENTE', severidade: 'aviso', campo: 'preco_m2_informado_brl', mensagem: `Preço/m² informado diverge ${(c.divergencia_frac! * 100).toFixed(1)}% do calculado (preço ÷ área).`, valor: String(v.preco_m2_informado_brl) });
    }
    return { dados, achados };
  },
  chave: (d) => (d.id_legado ? `legado|${d.id_legado}` : d.url_fonte ? `url|${urlCanonica(String(d.url_fonte))}` : null),
  chaves: (d) => [d.id_legado ? `legado|${d.id_legado}` : '', d.url_fonte ? `url|${urlCanonica(String(d.url_fonte))}` : ''].filter(Boolean),
  derivadasDe: { portal: ['fonte_id'], preco_pedido_brl: [] },
  async aposCriar(trx, a, ctx) {
    await trx.criar('anuncio_eventos', { anuncio_id: a.id, tipo: 'criado', ocorrido_em: new Date().toISOString(), status_novo: a.status, preco_novo_brl: a.preco_pedido_brl == null ? null : Number(a.preco_pedido_brl), autor_id: ctx.usuarioId, detalhes: 'importação' });
  },
  async antesDeAplicar(linhas, ctx) {
    const novas = new Map<string, string | null>();
    for (const l of linhas) if (l.dados.__fonte_nova) novas.set(String(l.dados.__fonte_nova), (l.dados.url_fonte as string) ?? null);
    for (const [nome, url] of novas) {
      const base = url ? new URL(url).origin : null;
      const slug = slugDe(nome) || 'fonte';
      await ctx.dados.criarOuAtualizar('fontes_portal', ['slug'], {
        slug: /^[a-z]/.test(slug) ? slug : `f_${slug}`, nome, tipo: 'portal', ativa: false, frequencia: 'manual',
        url_base: base && urlSegura(base) ? base : 'https://exemplo.invalid', parser: 'generico_html', estado: 'sem_dado',
        notas: 'Criada pela importação de anúncios; revise antes de ativar a coleta.',
      });
    }
    const fontes = await carregarFontes(ctx, true);
    for (const l of linhas) {
      if (l.dados.__fonte_nova) l.dados.fonte_id = Number(fontes.get(chaveNome(l.dados.__fonte_nova as string))!.id);
      delete l.dados.__fonte_nova;
    }
  },
};

// ---------------------------------------------------------------------------
// Lançamentos e âncoras (spec 5.5, 5.6; migração passos 5 e 10).

const lancamentos: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade;
    if ('localidade' in v) dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, false);
    const c = coordenada(v.latitude, v.longitude);
    // Metade de uma coordenada é pior que nenhuma: o lançamento fica fora do mapa (site, toCoord).
    if (!c) Object.assign(dados, { latitude: null, longitude: null, espacial_utilizavel: false });
    else if (v.espacial_utilizavel === null || v.espacial_utilizavel === undefined) dados.espacial_utilizavel = true;
    if (!v.estagio_vendas) dados.estagio_vendas = estagioDoStatus(v.status);
    return { dados, achados: [] };
  },
  chave: (d) => (d.id_legado ? `legado|${d.id_legado}` : d.nome ? `nome|${chaveNome(d.nome)}` : null),
  chaves: (d) => [d.id_legado ? `legado|${d.id_legado}` : '', d.nome ? `nome|${chaveNome(d.nome)}` : ''].filter(Boolean),
  async aposCriar(trx, l, ctx) {
    await trx.criar('lancamento_eventos', { lancamento_id: l.id, tipo: 'criado', ocorrido_em: new Date().toISOString(), status_novo: l.status, autor_id: ctx.usuarioId, detalhes: 'importação' });
  },
};

const ancoras: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade;
    if ('localidade' in v) dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, false);
    if (('latitude' in v || 'longitude' in v) && !coordenada(v.latitude, v.longitude)) erros.push({ coluna: 'latitude', codigo: 'COORDENADA_INVALIDA', mensagem: 'par de coordenadas fora da faixa ou incompleto' });
    if (!v.grupo) dados.grupo = grupoDaCategoria(v.categoria);
    if (!v.status) dados.status = 'ativa';
    return { dados, achados: [] };
  },
  chave: (d) => (d.id_legado ? `legado|${d.id_legado}` : d.nome ? `nome|${chaveNome(d.nome)}|${d.categoria}` : null),
  chaves: (d) => [d.id_legado ? `legado|${d.id_legado}` : '', d.nome ? `nome|${chaveNome(d.nome)}|${d.categoria}` : ''].filter(Boolean),
};

// ---------------------------------------------------------------------------
// Áreas de estudo (15.1b): os demais campos e os atributos de áreas criadas pela
// tela ou por KMZ; linha nova precisa de ponto (latitude/longitude) ou geometria.

const ESTAGIOS_DECISAO_IMPORT = new Set(['iniciativa', 'projeto', 'negocio_ativo', 'encerrada']);

const areasEstudo: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade;
    // A área própria que quem importa não lê nem casa com a linha (`visivel`): a prévia não confirma que ela existe.
    if (v.tipo === 'propria' && !ctx.papeis?.curador) {
      erros.push({ coluna: 'tipo', codigo: 'PAPEL_EXIGIDO', mensagem: 'área própria só entra para o curador' });
    }
    if (v.estagio && ESTAGIOS_DECISAO_IMPORT.has(String(v.estagio))) {
      erros.push({ coluna: 'estagio', codigo: 'DECISAO_PELA_TELA', mensagem: 'estágio de decisão (iniciativa ou além, encerrada) só pela tela, por quem decide, com motivo' });
    }
    if ('localidade' in v) dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, false);
    let g = (v.geometria as Geometria | null) ?? null;
    if (!g && v.centroide_latitude !== null && v.centroide_latitude !== undefined && v.centroide_longitude !== null && v.centroide_longitude !== undefined) {
      if (!coordenada(v.centroide_latitude, v.centroide_longitude)) erros.push({ coluna: 'latitude', codigo: 'COORDENADA_INVALIDA', mensagem: 'par de coordenadas fora da faixa' });
      else g = { type: 'Point', coordinates: [Number(v.centroide_longitude), Number(v.centroide_latitude)] } as Geometria;
    }
    if (g) {
      const problemas = validarGeometria(g);
      if (problemas.length) erros.push({ coluna: 'geometria', codigo: 'POLIGONO_INVALIDO', mensagem: problemas.join('; ') });
      else {
        const d = derivarGeometria(g);
        Object.assign(dados, {
          geometria: g, geometria_tipo: d.geometria_tipo, bbox_oeste: d.bbox_oeste, bbox_sul: d.bbox_sul, bbox_leste: d.bbox_leste, bbox_norte: d.bbox_norte,
          centroide_latitude: d.centroide_latitude, centroide_longitude: d.centroide_longitude, area_m2: d.area_m2, geometria_hash: d.geometria_hash,
        });
      }
    }
    dados.cidade_id = ctx.cidadeId;
    dados.autor_id = ctx.usuarioId;
    if (v.responsavel_id === undefined || v.responsavel_id === null) dados.responsavel_id = ctx.usuarioId;
    if (!v.estagio) dados.estagio = 'sinal';
    return { dados, achados: [] };
  },
  chave: (d) => (d.nome ? `nome|${chaveNome(String(d.nome))}` : null),
  visivel: (a, ctx) => !ctx.ator || podeLerArea(ctx.ator, a),
  conferirAtualizacao: (a, ctx) => (!ctx.ator || podeEscreverArea(ctx.ator, a)
    ? null
    : { coluna: 'nome', codigo: 'OBJETO_SEM_PERMISSAO', mensagem: 'só o autor ou o curador editam esta área (área própria: só o curador)' }),
  conferirNovo: (d) => (d.geometria ? null : { coluna: 'geometria', codigo: 'OBRIGATORIO', mensagem: 'área nova precisa de latitude e longitude ou geometria' }),
  derivadasDe: { geometria: ['geometria_tipo', 'bbox_oeste', 'bbox_sul', 'bbox_leste', 'bbox_norte', 'area_m2', 'geometria_hash', 'centroide_latitude', 'centroide_longitude'] },
};

// ---------------------------------------------------------------------------
// Séries publicadas de mercado (5.7): mês no dia 1º, conferência do IVV publicado
// contra o recalculado (vira achado, nunca correção).

/** `2024-01`, `2024-01-15`, `01/2024` → `2024-01-01`; `null` se não for mês. */
export function mesReferencia(v: unknown): string | null {
  const t = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(t);
  if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}-01` : null;
  m = /^(\d{2})\/(\d{4})$/.exec(t);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${m[2]}-${m[1]}-01` : null;
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (d) return Number(d[2]) >= 1 && Number(d[2]) <= 12 ? `${d[3]}-${d[2]}-01` : null;
  return null;
}

/** Tolerância da conferência publicado × recalculado (a do site, `DIVERGENCE_TOLERANCE`, 0,5%). */
const TOLERANCIA_IVV = 0.005;

const ivvMensal: GanchosTabela = {
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v, cidade_id: ctx.cidadeId };
    const mes = mesReferencia(v.mes_referencia);
    if (!mes) erros.push({ coluna: 'mes_referencia', codigo: 'DATA_INVALIDA', mensagem: `"${v.mes_referencia}" não é mês (AAAA-MM)` });
    dados.mes_referencia = mes;
    const achados: AchadoNovo[] = [];
    const ivv = v.ivv_frac as number | null;
    const vendas = v.vendas_unidades as number | null;
    const oferta = v.oferta_unidades as number | null;
    if (ivv !== null && ivv !== undefined && vendas !== null && vendas !== undefined && oferta) {
      const calc = vendas / oferta;
      const escala = Math.max(Math.abs(ivv), Math.abs(calc));
      if (escala > 0 && Math.abs(ivv - calc) / escala > TOLERANCIA_IVV) {
        achados.push({ codigo: 'IVV_DIVERGENTE', severidade: 'aviso', mensagem: `IVV publicado ${(ivv * 100).toFixed(2)}% e recalculado (vendas ÷ oferta) ${(calc * 100).toFixed(2)}% em ${mes}: o publicado vale.`, campo: 'ivv_frac', valor: String(ivv) });
      }
    }
    return { dados, achados };
  },
  chave: (d) => (d.mes_referencia ? `${String(d.mes_referencia).slice(0, 10)}|${d.escopo_segmento ?? ''}|${d.escopo_mercado ?? ''}` : null),
};

const ivvRegional: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v, cidade_id: ctx.cidadeId };
    delete dados.localidade;
    const mes = mesReferencia(v.mes_referencia);
    if (!mes) erros.push({ coluna: 'mes_referencia', codigo: 'DATA_INVALIDA', mensagem: `"${v.mes_referencia}" não é mês (AAAA-MM)` });
    dados.mes_referencia = mes;
    const nome = String(v.nome_regiao_fonte ?? '');
    dados.agregado_total = nome === 'DF Total';
    const achados: AchadoNovo[] = [];
    if (dados.agregado_total) dados.localidade_id = null;
    else {
      // Localidade pelo código informado ou pelo nome único; sem casar, fica sem localidade e vira aviso (o nome da fonte fica).
      const cache = await carregarLocalidades(ctx);
      const loc = resolverLocalidade(cache, v.localidade ?? nome);
      dados.localidade_id = loc ? loc.id : null;
      if (!loc && v.faixa_quartos === 'TOTAL') achados.push({ codigo: 'REGIAO_SEM_LOCALIDADE', severidade: 'aviso', mensagem: `"${nome}" não casa com nenhuma localidade cadastrada; cadastre o bairro ou submercado e reimporte com "Atualizar".`, campo: 'nome_regiao_fonte', valor: nome });
    }
    return { dados, achados };
  },
  chave: (d) => (d.mes_referencia ? `${String(d.mes_referencia).slice(0, 10)}|${d.nome_regiao_fonte}|${d.faixa_quartos}` : null),
};

const fipezapMensal: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v, cidade_id: ctx.cidadeId };
    delete dados.localidade;
    const mes = mesReferencia(v.mes_referencia);
    if (!mes) erros.push({ coluna: 'mes_referencia', codigo: 'DATA_INVALIDA', mensagem: `"${v.mes_referencia}" não é mês (AAAA-MM)` });
    dados.mes_referencia = mes;
    dados.unidade_preco ??= v.tipo_transacao === 'locacao' ? 'brl_m2_mes' : 'brl_m2';
    if (v.escopo_geografico === 'total') {
      dados.localidade_id = null;
      dados.nome_localidade_fonte ??= 'DF_TOTAL';
    } else {
      if (!v.nome_localidade_fonte) erros.push({ coluna: 'nome_localidade_fonte', codigo: 'OBRIGATORIO', mensagem: 'linha de localidade sem o nome da fonte' });
      // Pela `ra_geo_id` informada ou pelo nome único da RA na fonte; sem casar, fica só o nome da fonte (rótulo, não fusão).
      const cache = await carregarLocalidades(ctx);
      const loc = resolverLocalidade(cache, v.localidade) ?? resolverLocalidade(cache, v.nome_ra_fonte);
      dados.localidade_id = loc ? loc.id : null;
    }
    return { dados, achados: [] };
  },
  chave: (d) => (d.mes_referencia ? `${String(d.mes_referencia).slice(0, 10)}|${d.segmento}|${d.tipo_transacao}|${d.escopo_geografico}|${d.nome_localidade_fonte ?? ''}` : null),
};

const procedencias: GanchosTabela = {
  async preparar(v) {
    return { dados: { ...v }, achados: [] };
  },
  chave: (d) => (d.familia && d.codigo ? `${d.familia}|${d.codigo}` : null),
};

// ---------------------------------------------------------------------------
// PDAD (5.8): localidade pela `ra_geo_id`; categoria só de dígitos é resquício de
// extração e rejeita a linha (`CATEGORIA_NUMERICA`); suprimido/parcial nunca vira 0.

const METODOLOGIA_PDAD = ['figure_segmentation', 'figure_data_structure', 'figure_fields_to_capture', 'figure_preferred', 'figure_extraction_rule', 'figure_quality_notes', 'figure_map_status'];

const pdadObservacoes: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.localidade;
    dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, true);
    if (/^\d+$/.test(String(v.categoria_padrao ?? ''))) {
      erros.push({ coluna: 'categoria_padrao', codigo: 'CATEGORIA_NUMERICA', mensagem: `"${v.categoria_padrao}" é contagem gravada como categoria (resquício de extração), não categoria válida` });
    }
    const metodologia: Record<string, unknown> = {};
    for (const k of METODOLOGIA_PDAD) {
      if (v[k] !== null && v[k] !== undefined && v[k] !== '') metodologia[k] = v[k];
      delete dados[k];
    }
    dados.metodologia = Object.keys(metodologia).length ? metodologia : null;
    return { dados, achados: [] };
  },
  chave: (d) => (d.localidade_id && d.ano && d.codigo_indicador ? `${d.localidade_id}|${d.ano}|${d.codigo_indicador}|${d.valor_segmento ?? ''}|${d.categoria_padrao}` : null),
};

const pdadFiguras: GanchosTabela = {
  async preparar(v) {
    return { dados: { ...v }, achados: [] };
  },
  chave: (d) => (d.codigo_indicador ? String(d.codigo_indicador) : null),
};


// ---------------------------------------------------------------------------
// Grade analítica (recorte da Fase 4A, spec 5.13): célula H3 r9 ou quadrado IBGE e as métricas dela.

const celulas: GanchosTabela = {
  async carregar(ctx) {
    await carregarLocalidades(ctx);
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v, cidade_id: ctx.cidadeId };
    delete dados.localidade;
    // O índice H3 é hexadecimal minúsculo: maiúscula e minúscula são a mesma célula.
    if (v.grade === 'h3_r9' && typeof v.codigo === 'string') dados.codigo = v.codigo.toLowerCase();
    if (v.localidade) dados.localidade_id = await exigirLocalidade(ctx, v.localidade, 'localidade', erros, false);
    const g = v.geometria as Geometria | null;
    if (g) {
      if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') erros.push({ coluna: 'geometria', codigo: 'GEOMETRIA_INVALIDA', mensagem: 'a célula é Polygon ou MultiPolygon' });
      else for (const e of validarGeometria(g)) erros.push({ coluna: 'geometria', codigo: 'GEOMETRIA_INVALIDA', mensagem: e });
    }
    return { dados, achados: [] };
  },
  chave: (d) => (d.grade && d.codigo ? `${d.grade}|${d.codigo}` : null),
};

const celulaMetricas: GanchosTabela = {
  async carregar(ctx) {
    if (ctx.cache.has('celulas')) return;
    const linhas = await ctx.dados.varrerTudo('celulas', { filtros: { cidade_id: ctx.cidadeId }, maximo: 200000 });
    ctx.cache.set('celulas', new Map(linhas.map((c: Record<string, any>) => [`${c.grade}|${c.codigo}`, Number(c.id)])));
  },
  async preparar(v, ctx, erros) {
    const dados: Record<string, unknown> = { ...v };
    delete dados.grade;
    delete dados.celula;
    const mapa = ctx.cache.get('celulas') as Map<string, number>;
    const codigo = v.grade === 'h3_r9' ? String(v.celula).toLowerCase() : String(v.celula);
    const id = mapa.get(`${v.grade}|${codigo}`);
    if (!id) erros.push({ coluna: 'celula', codigo: 'CELULA_NAO_RESOLVIDA', mensagem: `a célula ${String(v.grade)} "${String(v.celula)}" não existe; importe as células antes` });
    dados.celula_id = id ?? null;
    return { dados, achados: [] };
  },
  chave: (d) => (d.celula_id && d.conjunto_codigo && d.ano && d.metrica ? `${d.celula_id}|${d.conjunto_codigo}|${d.ano}|${d.metrica}` : null),
};

export const GANCHOS: Record<string, GanchosTabela> = {
  pdad_observacoes: pdadObservacoes,
  pdad_figuras: pdadFiguras,
  fipezap_mensal: fipezapMensal,
  procedencias,
  ivv_mensal: ivvMensal,
  ivv_regional: ivvRegional,
  celulas,
  celula_metricas: celulaMetricas,
  areas_estudo: areasEstudo,
  localidades,
  localidade_perfis: localidadePerfis,
  contornos,
  fontes_portal: fontesPortal,
  anuncios,
  lancamentos,
  ancoras,
};
