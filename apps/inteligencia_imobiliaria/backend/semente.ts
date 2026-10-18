import type { HelperDados } from '@urbiverso/sdk';
import { RAS_DF } from '../comum/ras-df';

/** Cidade da semente (spec 5.3; centro e zoom do `config.js` do site). */
export const CIDADE_DF = {
  slug: 'distrito_federal',
  nome: 'Distrito Federal',
  uf: 'DF',
  codigo_ibge: '5300108',
  centro_latitude: -15.78,
  centro_longitude: -47.93,
  zoom_inicial: 10,
  ativa: true,
};

let emCurso: Promise<void> | null = null;

/**
 * Semente idempotente (spec 4.2): a cidade e as RAs com códigos oficiais, sem
 * geometria nem perfil. Só cria o que falta — nunca reescreve o que uma
 * importação já atualizou. Memoizada por processo; falha zera a memoização e o
 * request seguinte tenta de novo.
 */
export function garantirSemente(dados: HelperDados): Promise<void> {
  if (!emCurso) {
    emCurso = semear(dados).catch((e) => {
      emCurso = null;
      throw e;
    });
  }
  return emCurso;
}

/** Só para teste: esquece a memoização entre bancos falsos. */
export function esquecerSemente(): void {
  emCurso = null;
}

async function semear(dados: HelperDados): Promise<void> {
  const existentes = await dados.listar('cidades', { filtros: { slug: CIDADE_DF.slug }, por_pagina: 1 });
  const cidade = existentes.dados[0] ?? (await dados.criar('cidades', CIDADE_DF));
  const ras = await dados.varrerTudo('localidades', { filtros: { cidade_id: cidade.id, tipo: 'ra' }, removidos: 'incluir' });
  const codigos = new Set(ras.map((r) => String(r.codigo)));
  for (const ra of RAS_DF) {
    if (codigos.has(ra.codigo)) continue;
    await dados.criar('localidades', { cidade_id: cidade.id, tipo: 'ra', ...ra });
  }
}
