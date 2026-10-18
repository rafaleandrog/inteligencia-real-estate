import { Router, type Request } from 'express';
import { TABELAS_IMPORT } from '../../comum/importacao-chaves';
import { anosPdad, CATALOGO_PDAD, compararPdad, detalhePdad, dispersaoPdad, indicePdad, perfilPdad, rankingPdad, type IndicePdad } from '../diagnostico/pdad';
import { ErroApp, numeroQuery, ordenarEmMemoria, rota, textoQuery } from './comum';
import { cidadeDoRequest } from './territorio-comum';
import { areasOcultas } from './acesso-objeto';

type Linha = Record<string, any>;

export const diagnostico: Router = Router();

/** Acima disto o número da PDAD vem com aviso de cautela (D-29; parâmetro `pdad_cv_alerta_frac`). */
export const PDAD_CV_ALERTA_FRAC = 0.15;

/**
 * O índice da PDAD (~12 mil observações) é montado uma vez e guardado por
 * cidade; a assinatura (total e última alteração de cada tabela de origem)
 * muda com importação, edição ou desfazer, e aí ele é refeito.
 */
const cacheIndice = new Map<number, { assinatura: string; indice: IndicePdad }>();

async function assinaturaPdad(req: Request): Promise<string> {
  const partes = await Promise.all(['pdad_observacoes', 'localidades', 'localidade_perfis'].map(async (t) => {
    const r = await req.dados!.listar(t, { ordenar: 'atualizado_em', ordem: 'desc', por_pagina: 1 });
    const ultimo = r.dados[0]?.atualizado_em;
    return `${r.total}:${ultimo instanceof Date ? ultimo.toISOString() : String(ultimo ?? '')}`;
  }));
  return partes.join('|');
}

async function indice(req: Request): Promise<IndicePdad> {
  const cidade = await cidadeDoRequest(req);
  const assinatura = await assinaturaPdad(req);
  const guardado = cacheIndice.get(Number(cidade.id));
  if (guardado?.assinatura === assinatura) return guardado.indice;
  const novo = await montarIndice(req, Number(cidade.id));
  cacheIndice.set(Number(cidade.id), { assinatura, indice: novo });
  return novo;
}

async function montarIndice(req: Request, cidadeId: number): Promise<IndicePdad> {
  const cidade = { id: cidadeId };
  const localidades = await req.dados!.varrerTudo('localidades', { filtros: { cidade_id: cidade.id } });
  const ids = localidades.map((l) => Number(l.id));
  const observacoes = ids.length ? await req.dados!.varrerTudo('pdad_observacoes', { filtros: { localidade_id: ids } }) : [];
  // Renda per capita: a do perfil mais recente de cada localidade (RA_PROFILES), quando publicada.
  const perfis = ids.length ? ordenarEmMemoria(await req.dados!.varrerTudo('localidade_perfis', { filtros: { localidade_id: ids } }), 'ano_referencia') : [];
  const codigo = new Map(localidades.map((l) => [Number(l.id), String(l.codigo)]));
  const renda = new Map<string, number>();
  for (const p of perfis) if (p.renda_per_capita_brl !== null && p.renda_per_capita_brl !== undefined) renda.set(codigo.get(Number(p.localidade_id))!, Number(p.renda_per_capita_brl));
  return indicePdad(observacoes, localidades, renda, PDAD_CV_ALERTA_FRAC);
}

function anoDe(req: Request, ix: IndicePdad): number {
  const anos = anosPdad(ix);
  const pedido = numeroQuery(req, 'ano');
  if (pedido !== undefined) {
    if (!anos.some((a: Linha) => a.ano === pedido)) throw new ErroApp(404, 'ANO_SEM_PDAD', `Não há PDAD importada para ${pedido}.`, [`Anos disponíveis: ${anos.map((a: Linha) => a.ano).join(', ') || 'nenhum'}.`]);
    return pedido;
  }
  // Padrão: o ano de maior cobertura (o mais recente em empate).
  const melhor = [...anos].sort((a: Linha, b: Linha) => b.cobertura - a.cobertura || b.ano - a.ano)[0];
  if (!melhor) throw new ErroApp(404, 'ANO_SEM_PDAD', 'Nenhuma PDAD importada.', ['Importe a aba PDAD_A_DATA em Operação › Importações.']);
  return melhor.ano;
}

diagnostico.get('/diagnostico/catalogo', rota(async (_req, res) => {
  res.json(CATALOGO_PDAD);
}));

diagnostico.get('/diagnostico/anos', rota(async (req, res) => {
  const ix = await indice(req);
  res.json({ dados: anosPdad(ix), avisos: ix.avisos });
}));

diagnostico.get('/diagnostico/perfil', rota(async (req, res) => {
  const ix = await indice(req);
  const ano = anoDe(req, ix);
  const localidade = textoQuery(req, 'localidade') ?? 'todas';
  const tema = textoQuery(req, 'tema') ?? null;
  if (tema && !(tema in CATALOGO_PDAD.temas)) throw new ErroApp(400, 'FILTRO_INVALIDO', `Tema desconhecido: ${tema}.`);
  res.json(perfilPdad(ix, ano, localidade, tema));
}));

diagnostico.get('/diagnostico/perfil/detalhe', rota(async (req, res) => {
  const ix = await indice(req);
  const localidade = textoQuery(req, 'localidade');
  const indicador = textoQuery(req, 'indicador');
  if (!localidade || !indicador) throw new ErroApp(400, 'FILTRO_INVALIDO', 'Informe localidade e indicador.');
  res.json(detalhePdad(ix, anoDe(req, ix), localidade, indicador));
}));

diagnostico.get('/diagnostico/ranking', rota(async (req, res) => {
  const ix = await indice(req);
  const r = rankingPdad(ix, anoDe(req, ix), textoQuery(req, 'indicador') ?? 'deed');
  if (!r) throw new ErroApp(400, 'METRICA_DESCONHECIDA', 'Indicador fora do ranking.');
  res.json(r);
}));

diagnostico.get('/diagnostico/comparar', rota(async (req, res) => {
  const ix = await indice(req);
  const localidades = (textoQuery(req, 'localidades') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (localidades.length < 2 || localidades.length > 6) throw new ErroApp(400, 'FILTRO_INVALIDO', 'Compare de 2 a 6 localidades.');
  const kit = textoQuery(req, 'kit');
  const kits = CATALOGO_PDAD.kits as Linha;
  const indicadores = kit ? kits[kit]?.keys : (textoQuery(req, 'indicadores') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!indicadores || !indicadores.length || indicadores.length > 4) throw new ErroApp(400, 'FILTRO_INVALIDO', 'Escolha um kit ou de 1 a 4 indicadores.');
  res.json(compararPdad(ix, anoDe(req, ix), localidades, indicadores));
}));

diagnostico.get('/diagnostico/dispersao', rota(async (req, res) => {
  const ix = await indice(req);
  const r = dispersaoPdad(ix, anoDe(req, ix), textoQuery(req, 'leitura') ?? 'vert_loc');
  if (!r) throw new ErroApp(400, 'METRICA_DESCONHECIDA', 'Leitura de dispersão desconhecida.');
  res.json(r);
}));

/** Tabelas de dado que a Base lista, com o rótulo e o que conta. */
const FONTES_BASE: { tabela: string; rotulo: string; metodo: string }[] = [
  { tabela: 'anuncios', rotulo: 'Anúncios', metodo: 'Planilha migrada e cadastro; preço/m² informado vence o calculado.' },
  { tabela: 'lancamentos', rotulo: 'Lançamentos', metodo: 'Planilha migrada e cadastro.' },
  { tabela: 'ancoras', rotulo: 'Âncoras', metodo: 'Planilha migrada e cadastro.' },
  { tabela: 'contornos', rotulo: 'Contornos', metodo: 'GeoPortal (RAs), KML/KMZ e desenho; área e perímetro aproximados.' },
  { tabela: 'localidade_perfis', rotulo: 'Perfis das localidades', metodo: 'RA_PROFILES da planilha.' },
  { tabela: 'ivv_mensal', rotulo: 'IVV mensal', metodo: 'Publicado pela fonte; agregação por natureza (fluxo soma, estoque média, preço razão ponderada).' },
  { tabela: 'ivv_regional', rotulo: 'IVV por localidade', metodo: 'Retrato publicado; DF Total como régua.' },
  { tabela: 'fipezap_mensal', rotulo: 'FipeZap', metodo: 'Preço médio anunciado por m² (não é preço de transação).' },
  { tabela: 'pdad_observacoes', rotulo: 'PDAD', metodo: 'IPEDF; "todas" é média entre localidades, população e domicílios somam; suprimido não vira zero.' },
  { tabela: 'procedencias', rotulo: 'Procedências', metodo: 'Fontes e notas FipeZap, guia da PDAD.' },
  { tabela: 'areas_estudo', rotulo: 'Áreas de estudo', metodo: 'Cadastro da equipe (sem as próprias que você não lê).' },
];

/**
 * Base de dados (6.6): toda fonte com contagem, última importação (versão,
 * data, quem), procedência e os achados abertos; a área própria que o usuário
 * não lê fica fora da contagem (D-116).
 */
diagnostico.get('/diagnostico/base', rota(async (req, res) => {
  const ocultas = await areasOcultas(req);
  // Contagem por `total` do listar (uma linha por página): as tabelas grandes (anúncios, PDAD, contornos com geometria) não vêm para a memória.
  const contar = async (tabela: string, filtros: Record<string, unknown> = {}) => Number((await req.dados!.listar(tabela, { filtros, por_pagina: 1 })).total ?? 0);
  const achados = await req.dados!.varrerTudo('achados_qualidade', { filtros: { 'resolvido_em[nulo]': 'true' } });
  const fontes = [];
  for (const f of FONTES_BASE) {
    let contagem = await contar(f.tabela);
    if (f.tabela === 'areas_estudo' && ocultas.size) contagem -= await contar(f.tabela, { id: [...ocultas] });
    const [ultima = null] = (await req.dados!.listar('importacoes', { filtros: { status: 'aplicada', tabela_alvo: f.tabela }, ordenar: 'aplicada_em', ordem: 'desc', por_pagina: 1 })).dados;
    fontes.push({
      tabela: f.tabela, rotulo: f.rotulo, metodo: f.metodo, linhas: contagem,
      importavel: Boolean(TABELAS_IMPORT[f.tabela]),
      ultima_importacao: ultima ? { id: ultima.id, aplicada_em: ultima.aplicada_em, inseridas: ultima.inseridas, atualizadas: ultima.atualizadas, autor_nome: ultima.autor_nome ?? null, retrato_data: ultima.retrato_data ?? null } : null,
      achados_abertos: achados.filter((a) => a.tabela === f.tabela).length,
    });
  }
  res.json({ fontes, achados_abertos: achados.length, conjuntos_publicos: { disponivel: false, motivo: 'fase_futura', fase: '3' } });
}));
