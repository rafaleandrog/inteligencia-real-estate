import { Router, type Request } from 'express';
import { ehObjetoTipo } from '../../comum/objetos';
import { COMBINACOES, ENTIDADES_NUCLEO, SUBTIPOS_IMOVEL, tabelaNucleo, type EntidadeNucleo, type SubtipoImovel } from '../../comum/vinculos';
import { objetoAtivo, tabelaDoObjeto } from '../atributos/catalogo';
import { areaComAcesso, areasOcultas, exigirAcessoArea } from './acesso-objeto';
import { ErroApp, exigirPapel, idDaRota, naoEncontrado, paginacao, rota, textoQuery, usuarioId } from './comum';
import { criarCadastro, editarCadastro, escolher, historico, removerCadastro, restaurarCadastro } from './cadastro-comum';

type Linha = Record<string, any>;

export const vinculos: Router = Router();

/**
 * Confere a existência do id no imobiliário por `buscarPorChave` (spec 5.25):
 * só registro vivo casa. Sem o módulo no request (dependência não resolvida)
 * → `503 NUCLEO_INDISPONIVEL`; flag desligada sai pelo erro do contrato
 * (`403 NUCLEO_FLAG_*`), que o `rota()` repassa com status e código.
 */
async function conferirNoNucleo(req: Request, entidade: EntidadeNucleo, subtipo: SubtipoImovel | null, nucleoId: number): Promise<void> {
  const imob = req.modulos?.imobiliario;
  if (!imob) throw new ErroApp(503, 'NUCLEO_INDISPONIVEL', 'O módulo imobiliário não está disponível nesta instância.', ['Peça ao admin para instalar o módulo e ligar as flags de leitura da app.']);
  const tabela = tabelaNucleo(entidade, subtipo)!;
  const { achados } = await imob.buscarPorChave(tabela, ['id'], [{ id: nucleoId }]);
  const achou = [...achados.values()].some((r) => Number(r.id) === nucleoId);
  if (!achou) throw new ErroApp(422, 'VINCULO_NUCLEO_INEXISTENTE', `Não há ${tabela} vivo com id ${nucleoId} no imobiliário.`);
}

function lerCombinacao(corpo: Linha): { objeto_tipo: string; entidade: EntidadeNucleo; subtipo: SubtipoImovel | null } {
  const objetoTipo = String(corpo?.objeto_tipo ?? '');
  const entidade = String(corpo?.entidade ?? '') as EntidadeNucleo;
  const subtipo = corpo?.nucleo_subtipo ? String(corpo.nucleo_subtipo) as SubtipoImovel : null;
  const permitidas = ehObjetoTipo(objetoTipo) ? COMBINACOES[objetoTipo] : undefined;
  if (!permitidas || !ENTIDADES_NUCLEO.includes(entidade) || !permitidas.includes(entidade)) {
    const lista = Object.entries(COMBINACOES).map(([o, es]) => `${o} → ${es!.join(', ')}`);
    throw new ErroApp(422, 'VINCULO_NAO_PERMITIDO', `Combinação não permitida: ${objetoTipo || '?'} × ${entidade || '?'}.`, lista);
  }
  if (entidade === 'imoveis' && (!subtipo || !SUBTIPOS_IMOVEL.includes(subtipo))) {
    throw new ErroApp(422, 'VINCULO_NAO_PERMITIDO', 'Imóvel exige nucleo_subtipo: lote, gleba ou unidade.');
  }
  if (entidade !== 'imoveis' && subtipo) throw new ErroApp(422, 'VINCULO_NAO_PERMITIDO', 'nucleo_subtipo só vale para imóvel.');
  return { objeto_tipo: objetoTipo, entidade, subtipo };
}

vinculos.get('/vinculos-nucleo', rota(async (req, res) => {
  const filtros: Record<string, unknown> = {};
  for (const k of ['objeto_tipo', 'entidade', 'nucleo_subtipo'] as const) {
    const v = textoQuery(req, k);
    if (v) filtros[k] = v;
  }
  for (const k of ['objeto_id', 'nucleo_id'] as const) {
    const v = textoQuery(req, k);
    if (v) {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new ErroApp(400, 'FILTRO_INVALIDO', `${k} deve ser inteiro.`);
      filtros[k] = n;
    }
  }
  const removidos = textoQuery(req, 'removidos');
  const { pagina, por_pagina } = paginacao(req);
  // Vínculo de área própria só é lido por quem lê a área (5.25): fora antes da paginação.
  const ocultas = await areasOcultas(req);
  if (ocultas.size) {
    if (filtros.objeto_tipo === 'area_estudo' && ocultas.has(Number(filtros.objeto_id))) throw naoEncontrado();
    const deAreas = await req.dados!.varrerTudo('vinculos_nucleo', { filtros: { objeto_tipo: 'area_estudo' }, removidos: 'incluir' });
    const fora = new Set(deAreas.filter((v) => ocultas.has(Number(v.objeto_id))).map((v) => Number(v.id)));
    if (fora.size) {
      const todos = await req.dados!.varrerTudo('vinculos_nucleo', { filtros, removidos: 'incluir' });
      const permitidos = todos.map((v) => Number(v.id)).filter((id) => !fora.has(id));
      filtros.id = permitidos.length ? permitidos : [0];
    }
  }
  res.json(await req.dados!.listar('vinculos_nucleo', {
    filtros, pagina, por_pagina, ordenar: 'id', ordem: 'desc',
    ...(removidos === 'incluir' || removidos === 'apenas' ? { removidos: removidos as 'incluir' | 'apenas' } : {}),
  }));
}));

/**
 * Camada Núcleo do mapa (spec 10.2; D-141): os objetos da app que têm vínculo,
 * desenhados pela geometria da própria app, com o selo das entidades. O
 * traçado oficial do lote (módulo `geo`) não está no SDK 100 e não é lido.
 */
vinculos.get('/vinculos-nucleo/mapa', rota(async (req, res) => {
  const vivos = await req.dados!.varrerTudo('vinculos_nucleo');
  const porObjeto = new Map<string, Linha[]>();
  for (const v of vivos) {
    const k = `${v.objeto_tipo}:${v.objeto_id}`;
    porObjeto.set(k, [...(porObjeto.get(k) ?? []), v]);
  }
  const ids = (tipo: string) => [...porObjeto.keys()].filter((k) => k.startsWith(`${tipo}:`)).map((k) => Number(k.split(':')[1]));
  const selo = (tipo: string, id: number) => (porObjeto.get(`${tipo}:${id}`) ?? []).map((v) => ({ id: v.id, entidade: v.entidade, nucleo_subtipo: v.nucleo_subtipo ?? null, nucleo_id: v.nucleo_id }));
  const features: Linha[] = [];
  const idsContorno = ids('contorno');
  if (idsContorno.length) {
    for (const c of await req.dados!.varrerTudo('contornos', { filtros: { id: idsContorno } })) {
      features.push({ type: 'Feature', id: `contorno-${c.id}`, geometry: c.geometria, properties: { objeto_tipo: 'contorno', objeto_id: c.id, nome: c.nome, vinculos: selo('contorno', c.id) } });
    }
  }
  const idsLanc = ids('lancamento');
  if (idsLanc.length) {
    for (const l of await req.dados!.varrerTudo('lancamentos', { filtros: { id: idsLanc } })) {
      if (l.latitude === null || l.longitude === null || l.latitude === undefined) continue;
      features.push({ type: 'Feature', id: `lancamento-${l.id}`, geometry: { type: 'Point', coordinates: [Number(l.longitude), Number(l.latitude)] }, properties: { objeto_tipo: 'lancamento', objeto_id: l.id, nome: l.nome, vinculos: selo('lancamento', l.id) } });
    }
  }
  res.json({ type: 'FeatureCollection', features });
}));

/** Vínculo pelo id, com o sigilo da área a que ele pende. */
async function vinculoVisivel(req: Request, id: number): Promise<Linha> {
  const v = await req.dados!.buscar('vinculos_nucleo', id, { incluir_removidos: true });
  if (!v) throw naoEncontrado();
  if (v.objeto_tipo === 'area_estudo') await areaComAcesso(req, Number(v.objeto_id), 'ler');
  return v;
}

vinculos.get('/vinculos-nucleo/:id/historico', rota(async (req, res) => {
  await vinculoVisivel(req, idDaRota(req));
  res.json({ dados: await historico(req, 'vinculos_nucleo', idDaRota(req)) });
}));

vinculos.post('/vinculos-nucleo', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  const { objeto_tipo, entidade, subtipo } = lerCombinacao(req.body);
  const tipo = objetoAtivo(objeto_tipo);
  const objetoId = Number(req.body?.objeto_id);
  const nucleoId = Number(req.body?.nucleo_id);
  if (!Number.isInteger(objetoId) || objetoId <= 0 || !Number.isInteger(nucleoId) || nucleoId <= 0) {
    throw new ErroApp(422, 'DADOS_VALIDACAO_FALHOU', 'objeto_id e nucleo_id são inteiros positivos.');
  }
  const objeto = await req.dados!.buscar(tabelaDoObjeto(tipo), objetoId);
  if (!objeto) throw naoEncontrado();
  if (tipo === 'area_estudo') exigirAcessoArea(req, objeto, 'ler');
  const [existente] = await req.dados!.varrerTudo('vinculos_nucleo', { filtros: { objeto_tipo, objeto_id: objetoId, entidade, nucleo_id: nucleoId } });
  if (existente) throw new ErroApp(409, 'DADOS_UNIQUE_VIOLADO', 'Este vínculo já existe.');
  await conferirNoNucleo(req, entidade, subtipo, nucleoId);
  const notas = escolher(req.body, ['notas']).notas ?? null;
  const criado = await criarCadastro(req, 'vinculos_nucleo', {
    objeto_tipo, objeto_id: objetoId, entidade, nucleo_id: nucleoId, nucleo_subtipo: subtipo,
    vinculado_por_id: usuarioId(req), vinculado_em: new Date().toISOString(), notas, versao: 1,
  });
  res.status(201).json(criado);
}));

vinculos.patch('/vinculos-nucleo/:id', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  await vinculoVisivel(req, idDaRota(req));
  res.json(await editarCadastro(req, 'vinculos_nucleo', idDaRota(req), escolher(req.body, ['notas'])));
}));

vinculos.patch('/vinculos-nucleo/:id/remover', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  await vinculoVisivel(req, idDaRota(req));
  res.json(await removerCadastro(req, 'vinculos_nucleo', idDaRota(req)));
}));

vinculos.patch('/vinculos-nucleo/:id/restaurar', rota(async (req, res) => {
  exigirPapel(req, 'curador');
  await vinculoVisivel(req, idDaRota(req));
  res.json(await restaurarCadastro(req, 'vinculos_nucleo', idDaRota(req)));
}));
