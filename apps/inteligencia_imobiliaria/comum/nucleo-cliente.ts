/**
 * Cliente único do núcleo imobiliário (spec 5.25, D-140). É o ÚNICO arquivo
 * da app que chama `urbiVerso.modulo('imobiliario', caminho)`; um teste
 * reprova outro que o chame. Toda leitura do núcleo para tela passa aqui:
 * paginação em laço, allowlist de filtros, conferência na volta, cache de
 * 60 s e erro de flag como estado, nunca como tela quebrada.
 *
 * Nunca: detalhe de matrícula, `/pessoas`, `/:id/pessoas`, `transacoes`,
 * filtro `bbox`. Não remonta `id_legivel` nem `area_efetiva`.
 */

/** Por chamada, `por_pagina` máximo do núcleo (nucleo.md:446). */
export const POR_PAGINA_NUCLEO = 200;
/** Teto do laço: 50 páginas = 10 000 linhas; passou, a tela diz "lista grande demais". */
export const TETO_PAGINAS_NUCLEO = 50;
export const CACHE_NUCLEO_MS = 60_000;

/** Filtros de igualdade que o núcleo aceita, conferidos no SDK 100 em 2026-10-17 (nucleo.md:459). */
export const FILTROS_ACEITOS: Readonly<Record<string, readonly string[]>> = {
  lotes: ['parcelamento_id', 'incorporacao_id', 'matricula_id'],
  glebas: ['matricula_id'],
  unidades: ['incorporacao_id', 'matricula_id'],
  parcelamentos: ['setor_habitacional_id'],
  incorporacoes: [],
  matriculas: [],
  'setores-habitacionais': [],
};

/** Coleções que a app lê. Matrícula só pela listagem (o detalhe traz certidão e proprietários). */
export const COLECOES_NUCLEO = Object.keys(FILTROS_ACEITOS);
const DETALHE_PERMITIDO = new Set(['lotes', 'glebas', 'unidades', 'parcelamentos', 'incorporacoes', 'setores-habitacionais']);

export type EstadoNucleo = 'resolve' | 'nao_encontrado' | 'sem_permissao' | 'indisponivel';

export interface ErroNucleo {
  estado: Exclude<EstadoNucleo, 'resolve'>;
  codigo: string | null;
  mensagem: string;
}

export interface ListaNucleo {
  linhas: Record<string, any>[];
  /** Passou do teto de páginas: a tela não mostra parcial. */
  grande_demais: boolean;
  /** Algum filtro foi aplicado no cliente porque o núcleo não o aceita. */
  filtrado_no_cliente: string[];
  /** O núcleo devolveu linha que não casa com o filtro enviado (R-55). */
  filtro_ignorado: boolean;
  erro: ErroNucleo | null;
}

export type Chamador = (caminho: string) => Promise<any>;

function textoErro(e: unknown): ErroNucleo {
  const x = e as { status?: number; codigo?: string; message?: string };
  if (x?.codigo === 'NUCLEO_FLAG_DESLIGADA' || x?.codigo === 'NUCLEO_FLAG_NAO_PEDIDA' || x?.status === 403) {
    return { estado: 'sem_permissao', codigo: x?.codigo ?? null, mensagem: 'O admin da instância precisa ligar a leitura desta entidade na aba Núcleo da app.' };
  }
  if (x?.status === 404) return { estado: 'nao_encontrado', codigo: x?.codigo ?? null, mensagem: 'Registro não encontrado no núcleo (removido ou id errado).' };
  return { estado: 'indisponivel', codigo: x?.codigo ?? null, mensagem: x?.message || 'O núcleo não respondeu.' };
}

function casa(linha: Record<string, any>, filtros: Record<string, string | number>): boolean {
  return Object.entries(filtros).every(([k, v]) => String(linha[k] ?? '') === String(v));
}

function conferirColecao(colecao: string): void {
  if (!COLECOES_NUCLEO.includes(colecao)) throw new Error(`Coleção do núcleo fora do que a app lê: ${colecao}`);
}

export interface ClienteNucleo {
  listar(colecao: string, filtros?: Record<string, string | number>, busca?: string): Promise<ListaNucleo>;
  ler(colecao: string, id: number): Promise<{ estado: EstadoNucleo; registro: Record<string, any> | null; erro: ErroNucleo | null }>;
  limpar(): void;
}

/** Cria o cliente sobre um chamador (o `urbiVerso.modulo` na tela; um falso no teste). */
export function criarClienteNucleo(chamar: Chamador, agora: () => number = Date.now): ClienteNucleo {
  const cache = new Map<string, { em: number; valor: Promise<any> }>();

  async function obter(caminho: string): Promise<any> {
    const c = cache.get(caminho);
    if (c && agora() - c.em < CACHE_NUCLEO_MS) return c.valor;
    const valor = chamar(caminho);
    cache.set(caminho, { em: agora(), valor });
    valor.catch(() => cache.delete(caminho));
    return valor;
  }

  return {
    async listar(colecao, filtros = {}, busca) {
      conferirColecao(colecao);
      const aceitos = FILTROS_ACEITOS[colecao];
      const enviados: Record<string, string | number> = {};
      const locais: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(filtros)) (aceitos.includes(k) ? enviados : locais)[k] = v;
      const out: ListaNucleo = { linhas: [], grande_demais: false, filtrado_no_cliente: Object.keys(locais), filtro_ignorado: false, erro: null };
      try {
        for (let pagina = 1; ; pagina++) {
          if (pagina > TETO_PAGINAS_NUCLEO) {
            out.grande_demais = true;
            out.linhas = [];
            return out;
          }
          const q = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA_NUCLEO) });
          for (const [k, v] of Object.entries(enviados)) q.set(k, String(v));
          if (busca) q.set('busca', busca);
          const r = await obter(`/${colecao}?${q}`);
          const dados: Record<string, any>[] = Array.isArray(r?.dados) ? r.dados : [];
          for (const l of dados) {
            if (!casa(l, enviados)) {
              out.filtro_ignorado = true;
              continue;
            }
            if (casa(l, locais)) out.linhas.push(l);
          }
          if (dados.length < POR_PAGINA_NUCLEO) break;
        }
      } catch (e) {
        out.erro = textoErro(e);
        out.linhas = [];
      }
      return out;
    },

    async ler(colecao, id) {
      conferirColecao(colecao);
      if (colecao === 'matriculas') {
        // Matrícula: nunca o detalhe (certidão e proprietários); escolhida por id na listagem cacheada.
        const l = await this.listar('matriculas');
        if (l.erro) return { estado: l.erro.estado, registro: null, erro: l.erro };
        const reg = l.linhas.find((m) => Number(m.id) === Number(id)) ?? null;
        return reg ? { estado: 'resolve', registro: reg, erro: null } : { estado: 'nao_encontrado', registro: null, erro: textoErro({ status: 404 }) };
      }
      if (!DETALHE_PERMITIDO.has(colecao)) throw new Error(`Detalhe não lido pela app: ${colecao}`);
      try {
        const reg = await obter(`/${colecao}/${Number(id)}`);
        return { estado: 'resolve', registro: reg, erro: null };
      } catch (e) {
        const erro = textoErro(e);
        return { estado: erro.estado, registro: null, erro };
      }
    },

    limpar() {
      cache.clear();
    },
  };
}

interface ComModulo { modulo(slug: string, caminho: string): Promise<any> }
declare const urbiVerso: ComModulo;

let padrao: ClienteNucleo | null = null;
/** O cliente da sessão, sobre `urbiVerso.modulo('imobiliario', …)`. */
export function nucleo(): ClienteNucleo {
  padrao ??= criarClienteNucleo((caminho) => urbiVerso.modulo('imobiliario', caminho));
  return padrao;
}
