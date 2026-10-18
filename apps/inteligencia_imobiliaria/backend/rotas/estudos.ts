import { Router, type Request } from 'express';
import { pontoNoPoligono, validarGeometria, type Geometria } from '../../comum/geo';
import { ESTAGIOS, ESTAGIOS_DECISAO, TIPOS_AREA, podeEscreverArea, podeTipoPropria, type Estagio } from '../../comum/regras-objeto';
import { derivarGeometria } from '../importacao/tabelas';
import { colunasAtributosCsv, idsPorAtributos } from '../atributos/filtro';
import { atorDe, areaComAcesso, exigirAcessoArea } from './acesso-objeto';
import { ErroApp, idDaRota, naoEncontrado, paginacao, rota, textoQuery, usuarioId } from './comum';
import { criarCadastro, diferenca, escolher, historico, registrarAlteracao, versaoDoCorpo } from './cadastro-comum';
import { querCsv, responderCsv } from './exportar';
import { cidadeDoRequest } from './territorio-comum';
import { aplicarTravado, contarVertices, lerFeicoes, previaOuFalha } from './territorio';
import { anexarLocalidade } from './cadastro-fabrica';
import { podeLerArea } from '../../comum/regras-objeto';

type Linha = Record<string, any>;

export const estudos: Router = Router();

const COLUNAS_CSV = [
  'id', 'nome', 'tipo', 'estagio', 'localidade_nome', 'responsavel_nome', 'autor_nome', 'area_m2',
  'centroide_latitude', 'centroide_longitude', 'geometria_tipo', 'motivo_encerramento', 'aprendizado', 'notas', 'versao',
];
const CAMPOS_EDITAVEIS = ['nome', 'tipo', 'estagio', 'motivo_encerramento', 'aprendizado', 'responsavel_id', 'localidade_id', 'notas'] as const;
/** O que o decisor muda sem ser autor nem curador: só a decisão (D-130). */
const CAMPOS_DECISAO = new Set(['estagio', 'motivo_encerramento', 'aprendizado', 'motivo', 'versao']);

function geometriaValida(g: unknown): Geometria {
  const erros = validarGeometria(g);
  if (erros.length) throw new ErroApp(400, 'POLIGONO_INVALIDO', 'Geometria inválida.', erros);
  const t = (g as Geometria).type;
  if (t !== 'Point' && t !== 'Polygon' && t !== 'MultiPolygon') throw new ErroApp(400, 'POLIGONO_INVALIDO', 'Área de estudo é ponto ou polígono.', [`Tipo recebido: ${t}.`]);
  return g as Geometria;
}

/** Geometria do corpo: `geometria` (desenho) ou `latitude`/`longitude` (ponto). */
function geometriaDoCorpo(corpo: Linha): Geometria | null {
  if (corpo?.geometria) return geometriaValida(corpo.geometria);
  const lat = Number(corpo?.latitude);
  const lon = Number(corpo?.longitude);
  if (corpo?.latitude !== undefined && corpo?.longitude !== undefined) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ErroApp(400, 'COORDENADA_INVALIDA', 'Latitude e longitude fora da faixa.');
    return { type: 'Point', coordinates: [lon, lat] } as Geometria;
  }
  return null;
}

function colunasGeometria(g: Geometria): Linha {
  const d = derivarGeometria(g);
  return {
    geometria: g, geometria_tipo: d.geometria_tipo, bbox_oeste: d.bbox_oeste, bbox_sul: d.bbox_sul, bbox_leste: d.bbox_leste, bbox_norte: d.bbox_norte,
    centroide_latitude: d.centroide_latitude, centroide_longitude: d.centroide_longitude, area_m2: d.area_m2, geometria_hash: d.geometria_hash,
  };
}

/** Localidade dominante: a RA cujo contorno contém o centroide (5.16). */
export async function localidadeDominante(req: Request, lat: number, lon: number): Promise<number | null> {
  const ras = await req.dados!.varrerTudo('contornos', {
    filtros: { tipo_entidade: 'regiao_administrativa', status: 'ativo', 'bbox_oeste[lte]': lon, 'bbox_leste[gte]': lon, 'bbox_sul[lte]': lat, 'bbox_norte[gte]': lat },
  });
  const ra = ras.find((c) => c.localidade_id && pontoNoPoligono(lon, lat, c.geometria));
  return ra ? Number(ra.localidade_id) : null;
}

/**
 * Regras de tipo e estágio (5.16, D-130): `propria` só pelo curador; estágio
 * de decisão só pelo admin ou `decisor`, com `motivo`; `encerrada` exige
 * `motivo_encerramento`. Devolve o motivo da decisão para `alteracoes_cadastro`.
 */
function conferirTipoEEstagio(req: Request, novo: Linha, atual: Linha | null): string | null {
  const ator = atorDe(req);
  const erros: string[] = [];
  if (novo.tipo !== undefined && !TIPOS_AREA.includes(novo.tipo)) erros.push(`tipo: um de ${TIPOS_AREA.join(', ')}.`);
  if (novo.estagio !== undefined && !ESTAGIOS.includes(novo.estagio)) erros.push(`estagio: um de ${ESTAGIOS.join(', ')}.`);
  if (erros.length) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Há campos inválidos.', erros);
  if (novo.tipo === 'propria' && atual?.tipo !== 'propria' && !podeTipoPropria(ator)) {
    throw new ErroApp(403, 'PAPEL_EXIGIDO', 'Só o curador cria área própria ou passa uma área para própria.');
  }
  const estagio = (novo.estagio ?? atual?.estagio ?? 'sinal') as Estagio;
  const mudouEstagio = novo.estagio !== undefined && novo.estagio !== (atual?.estagio ?? null);
  if (!mudouEstagio || !ESTAGIOS_DECISAO.includes(estagio)) return null;
  if (!(ator.admin || (ator.escrita && ator.papeis.includes('decisor')))) {
    throw new ErroApp(403, 'PAPEL_EXIGIDO', 'Mudar o estágio para iniciativa ou além, ou encerrar, exige o papel decisor.');
  }
  const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
  if (!motivo) throw new ErroApp(422, 'MOTIVO_OBRIGATORIO', 'Diga o motivo da decisão de estágio.', ['motivo é obrigatório.']);
  if (estagio === 'encerrada' && !(novo.motivo_encerramento ?? atual?.motivo_encerramento)) {
    throw new ErroApp(422, 'MOTIVO_OBRIGATORIO', 'Encerrar a área exige o motivo do encerramento.', ['motivo_encerramento é obrigatório.']);
  }
  return motivo;
}

/** `datahora` chega como `Date` do helper (banco-de-dados.md) e como texto ISO no fake. */
const quando = (v: unknown): number => (v ? new Date(v as string).getTime() || 0 : 0);

async function anexar(req: Request, linhas: Linha[]): Promise<Linha[]> {
  return anexarLocalidade(req, linhas);
}

/**
 * Lista (6.11): o sigilo é aplicado antes da paginação (D-116), para que
 * `total` não denuncie a área própria. As áreas são poucas (centenas): a
 * lista varre a cidade e pagina em código. O CSV sai sem área própria para
 * ninguém até a trilha de saídas (`area_eventos`) existir (4C).
 */
estudos.get('/estudos', rota(async (req, res) => {
  const ator = atorDe(req);
  const filtros: Record<string, unknown> = {};
  for (const k of ['tipo', 'estagio'] as const) {
    const v = textoQuery(req, k);
    if (v) filtros[k] = v.split(',');
  }
  const resp = textoQuery(req, 'responsavel');
  if (resp) {
    if (resp !== 'eu' && !/^\d+$/.test(resp)) throw new ErroApp(400, 'PARAMETRO_INVALIDO', 'responsavel: "eu" ou o id do usuário.');
    filtros.responsavel_id = resp === 'eu' ? ator.id : Number(resp);
  }
  const ids = await idsPorAtributos(req, 'area_estudo');
  if (ids) filtros.id = ids.length ? ids : [0];
  const removidos = textoQuery(req, 'removidos');
  // Varredura na ordem padrão (id): ordenar por coluna não única em varrerTudo pode repetir ou pular linha (banco-de-dados.md).
  let linhas = await req.dados!.varrerTudo('areas_estudo', {
    filtros,
    ...(removidos === 'incluir' || removidos === 'apenas' ? { removidos: removidos as 'incluir' | 'apenas' } : {}),
  });
  linhas = linhas.filter((a) => podeLerArea(ator, a)).sort((a, b) => quando(b.atualizado_em) - quando(a.atualizado_em) || Number(b.id) - Number(a.id));
  const q = textoQuery(req, 'q');
  if (q) {
    const t = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    linhas = linhas.filter((a) => `${a.nome} ${a.notas ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t));
  }
  if (querCsv(req)) {
    const semProprias = linhas.filter((a) => a.tipo !== 'propria');
    const anexadas = await anexar(req, semProprias);
    const atr = await colunasAtributosCsv(req.dados!, 'area_estudo', anexadas);
    responderCsv(res, 'areas_estudo', [...COLUNAS_CSV, 'geometria', ...atr.colunas], atr.linhas);
    return;
  }
  const { pagina, por_pagina } = paginacao(req);
  const total = linhas.length;
  const pag = await anexar(req, linhas.slice((pagina - 1) * por_pagina, pagina * por_pagina));
  res.json({
    dados: pag.map((a) => ({ ...a, pode_editar: podeEscreverArea(ator, a) })),
    total, pagina, por_pagina, paginas: Math.max(1, Math.ceil(total / por_pagina)),
  });
}));

estudos.get('/estudos/:id', rota(async (req, res) => {
  const area = await areaComAcesso(req, idDaRota(req), 'ler');
  const [anexada] = await anexar(req, [area]);
  res.json({
    ...anexada,
    pode_editar: podeEscreverArea(atorDe(req), area),
    dossie: null,
    indisponivel: { dossie: { motivo: 'fase_futura', fase: '4B' } },
  });
}));

estudos.get('/estudos/:id/historico', rota(async (req, res) => {
  const id = idDaRota(req);
  await areaComAcesso(req, id, 'ler');
  res.json({ dados: await historico(req, 'areas_estudo', id) });
}));

/** Cria por desenho (`geometria`) ou por ponto (`latitude`/`longitude`). */
estudos.post('/estudos', rota(async (req, res) => {
  const dados: Linha = escolher(req.body, CAMPOS_EDITAVEIS);
  if (!dados.nome) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Dê um nome à área.', ['nome é obrigatório.']);
  dados.tipo ??= 'prospeccao';
  dados.estagio ??= 'sinal';
  const motivo = conferirTipoEEstagio(req, dados, null);
  const g = geometriaDoCorpo(req.body);
  if (!g) throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'Desenhe a área ou informe o ponto.', ['geometria, ou latitude e longitude, é obrigatório.']);
  const geo = colunasGeometria(g);
  const cidade = await cidadeDoRequest(req);
  const localidade = dados.localidade_id ? Number(dados.localidade_id) : await localidadeDominante(req, Number(geo.centroide_latitude), Number(geo.centroide_longitude));
  const criado = await criarCadastro(req, 'areas_estudo', {
    ...dados, ...geo, localidade_id: localidade, cidade_id: cidade.id, autor_id: usuarioId(req),
    responsavel_id: dados.responsavel_id ? Number(dados.responsavel_id) : usuarioId(req), versao: 1,
  }, motivo ? async (trx, c) => { await registrarAlteracao(trx, req, 'areas_estudo', Number(c.id), 'editado', { estagio: { antes: null, depois: c.estagio } }, motivo); } : undefined);
  res.status(201).json(criado);
}));

/**
 * Edição (6.11): autor ou curador (própria: curador); o decisor que não é
 * nenhum dos dois muda só a decisão de estágio. Estágio de decisão grava quem
 * decidiu e o motivo em `alteracoes_cadastro` até a 4C criar `area_eventos`.
 */
estudos.patch('/estudos/:id', rota(async (req, res) => {
  const id = idDaRota(req);
  const atual = await areaComAcesso(req, id, 'ler');
  if (atual.removido_em) throw new ErroApp(404, 'REGISTRO_REMOVIDO', 'A área foi removida; restaure-a antes de editar.');
  const patch: Linha = escolher(req.body, CAMPOS_EDITAVEIS);
  const g = geometriaDoCorpo(req.body);
  if (g) Object.assign(patch, colunasGeometria(g));
  const soDecisao = Object.keys(req.body ?? {}).every((k) => CAMPOS_DECISAO.has(k));
  // Só a decisão de estágio, e o estágio muda de fato: basta ler a área; quem decide é conferido abaixo (403 PAPEL_EXIGIDO).
  const decideEstagio = soDecisao && patch.estagio !== undefined && patch.estagio !== atual.estagio && ESTAGIOS_DECISAO.includes(patch.estagio);
  if (!decideEstagio) exigirAcessoArea(req, atual, 'escrever');
  const motivo = conferirTipoEEstagio(req, patch, atual);
  const versao = versaoDoCorpo(req);
  if (Number(atual.versao) !== versao) throw new ErroApp(409, 'CONFLITO_VERSAO', 'Outra pessoa alterou esta área depois que você a abriu.', ['Recarregue e refaça a alteração.']);
  if (patch.responsavel_id !== undefined) patch.responsavel_id = patch.responsavel_id === null ? null : Number(patch.responsavel_id);
  const campos = diferenca(atual, patch);
  const r = await req.dados!.transaction(async (trx) => {
    const novo = await trx.atualizarSe('areas_estudo', id, { ...patch, versao: versao + 1 }, { versao });
    if (!novo) throw new ErroApp(409, 'CONFLITO_VERSAO', 'Outra pessoa alterou esta área depois que você a abriu.');
    if (Object.keys(campos).length) await registrarAlteracao(trx, req, 'areas_estudo', id, 'editado', campos, motivo ?? req.body?.motivo);
    return novo;
  });
  res.json(r);
}));

estudos.patch('/estudos/:id/remover', rota(async (req, res) => {
  const id = idDaRota(req);
  const area = await areaComAcesso(req, id, 'escrever');
  if (area.removido_em) return void res.json(area);
  const r = await req.dados!.transaction(async (trx) => {
    const x = await trx.remover('areas_estudo', id, usuarioId(req));
    await registrarAlteracao(trx, req, 'areas_estudo', id, 'removido', null, req.body?.motivo);
    return x;
  });
  res.json(r);
}));

estudos.patch('/estudos/:id/restaurar', rota(async (req, res) => {
  const id = idDaRota(req);
  const area = await areaComAcesso(req, id, 'escrever');
  if (!area.removido_em) return void res.json(area);
  const r = await req.dados!.transaction(async (trx) => {
    const x = await trx.restaurar('areas_estudo', id);
    await registrarAlteracao(trx, req, 'areas_estudo', id, 'restaurado', null, req.body?.motivo);
    return x;
  });
  res.json(r);
}));

// ------------------------------------------------ importar KML/KMZ/GeoJSON

/** Prévia (o mesmo fluxo dos contornos; C-38): grava a importação na hora e lista as feições. */
estudos.post('/estudos/importar', rota(async (req, res) => {
  const uploadId = Number(req.body?.upload_id);
  if (!Number.isInteger(uploadId) || uploadId <= 0) throw new ErroApp(422, 'UPLOAD_OBRIGATORIO', 'Envie o arquivo antes (upload_id).');
  const imp = await req.dados!.criar('importacoes', {
    tabela_alvo: 'areas_estudo', tipo_arquivo: 'outro', arquivo: uploadId, modo_duplicata: 'ignorar', status: 'previa', autor_id: usuarioId(req),
  });
  const { lido, feicoes } = await previaOuFalha(req, Number(imp.id), async () => {
    const lido = await lerFeicoes(req, Number(imp.arquivo));
    const feicoes = lido.feicoes.map((f, i) => {
      let erros = [...f.erros];
      if (!erros.length && !['Point', 'Polygon', 'MultiPolygon'].includes(f.geometria.type)) erros = [`${f.geometria.type} não é área (ponto ou polígono)`];
      return { indice: i, nome: f.nome, tipo: f.geometria?.type ?? null, vertices: contarVertices(f.geometria), erros };
    });
    await req.dados!.atualizar('importacoes', imp.id, {
      total_linhas: feicoes.length, rejeitadas: feicoes.filter((f) => f.erros.length).length, arquivo_sha256: lido.sha256,
      mapeamento: { arquivo: lido.nome, formato: lido.formato },
    });
    return { lido, feicoes };
  });
  res.status(201).json({ importacao_id: imp.id, formato: lido.formato, feicoes });
}));

/** Aplica: cria uma área por feição válida, sem duplicar pela geometria; `tipo` e `estagio` do corpo. */
estudos.post('/estudos/importar/:importacao_id/aplicar', rota(async (req, res) => {
  const imp = await req.dados!.buscar('importacoes', idDaRota(req, 'importacao_id'));
  if (!imp || imp.tabela_alvo !== 'areas_estudo' || imp.tipo_arquivo !== 'outro') throw naoEncontrado();
  if (imp.status !== 'previa') throw new ErroApp(409, 'IMPORTACAO_NAO_APLICAVEL', `A importação está "${imp.status}".`);
  const base: Linha = { tipo: req.body?.tipo ?? 'prospeccao', estagio: req.body?.estagio ?? 'sinal' };
  const motivo = conferirTipoEEstagio(req, base, null);
  res.json(await aplicarTravado(req, Number(imp.id), async () => {
    const lido = await lerFeicoes(req, Number(imp.arquivo));
    const escolhidas: number[] | null = Array.isArray(req.body?.indices) ? req.body.indices.map(Number) : null;
    const cidade = await cidadeDoRequest(req);
    const hashes = new Set((await req.dados!.varrerTudo('areas_estudo', { removidos: 'incluir' })).map((a) => a.geometria_hash));
    const responsavel = req.body?.responsavel_id ? Number(req.body.responsavel_id) : usuarioId(req);
    let inseridas = 0;
    let ignoradas = 0;
    const rejeicoes: { linha: number; coluna: string; codigo: string; mensagem: string }[] = [];
    const novas: Linha[] = [];
    for (const [i, f] of lido.feicoes.entries()) {
      if (escolhidas && !escolhidas.includes(i)) { ignoradas++; continue; }
      const problemas = f.erros.length ? f.erros : ['Point', 'Polygon', 'MultiPolygon'].includes(f.geometria.type) ? [] : [`${f.geometria.type} não é área`];
      if (problemas.length) { rejeicoes.push({ linha: i + 1, coluna: 'geometria', codigo: 'POLIGONO_INVALIDO', mensagem: problemas.join('; ') }); continue; }
      const geo = colunasGeometria(f.geometria);
      if (hashes.has(geo.geometria_hash)) { ignoradas++; continue; }
      hashes.add(geo.geometria_hash);
      novas.push({ nome: (f.nome || `Área ${i + 1}`).slice(0, 200), geo });
    }
    const localidades = await Promise.all(novas.map((n) => localidadeDominante(req, Number(n.geo.centroide_latitude), Number(n.geo.centroide_longitude))));
    await req.dados!.transaction(async (trx) => {
      for (const [k, n] of novas.entries()) {
        const c = await trx.criar('areas_estudo', {
          nome: n.nome, ...base, ...n.geo, cidade_id: cidade.id, localidade_id: localidades[k], autor_id: usuarioId(req), responsavel_id: responsavel,
          importacao_id: imp.id, notas: `Importada de ${String(imp.mapeamento?.arquivo ?? 'arquivo')}.`, versao: 1,
        });
        await registrarAlteracao(trx, req, 'areas_estudo', Number(c.id), 'criado', null, motivo);
        inseridas++;
      }
    });
    const final = await req.dados!.atualizar('importacoes', imp.id, {
      status: 'aplicada', aplicada_em: new Date().toISOString(), inseridas, ignoradas, rejeitadas: rejeicoes.length, atualizadas: 0, relatorio: { rejeicoes },
    });
    return { ...final, rejeicoes };
  }));
}));
