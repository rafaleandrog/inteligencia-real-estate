import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rotas } from '../backend/rotas';
import { estudos } from '../backend/rotas/estudos';
import { esquecerSemente } from '../backend/semente';
import { DadosFalsos, PERFIS, rotasRegistradas, servidor, type PerfilTeste } from './infra';
import { ArquivosFalsos } from './arquivos-falsos';

/**
 * Matriz rota × perfil das áreas de estudo (spec 14, T4). Cenário fixo: `P` é
 * área própria (autora: curadora; responsável: o perfil `responsavel`) e `Q` é
 * prospecção da `autor`. A lista de rotas é conferida contra a pilha do Router
 * por contagem exata: rota nova sem linha aqui reprova.
 */

beforeEach(() => esquecerSemente());

const QUADRADO = { type: 'Polygon', coordinates: [[[-47.9, -15.8], [-47.8, -15.8], [-47.8, -15.7], [-47.9, -15.7], [-47.9, -15.8]]] };
const KML = '<kml><Document><Placemark><name>Gleba</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-47.7,-15.6 -47.6,-15.6 -47.6,-15.5 -47.7,-15.6</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>';

type Perfil = 'autor' | 'responsavel' | 'curador' | 'estrategico' | 'decisor' | 'escrita' | 'leitura';
const PERFIS_MATRIZ: Perfil[] = ['autor', 'responsavel', 'curador', 'estrategico', 'decisor', 'escrita', 'leitura'];

interface Cenario {
  s: Awaited<ReturnType<typeof servidor>>;
  arquivos: ArquivosFalsos;
  P: number;
  Q: number;
}

async function cenario(): Promise<Cenario> {
  const arquivos = new ArquivosFalsos();
  const s = await servidor(rotas, new DadosFalsos(), { arquivos: arquivos.helper() });
  const p = await s.chamar('POST', '/estudos', { nome: 'Área da UP', tipo: 'propria', geometria: QUADRADO, responsavel_id: PERFIS.responsavel.id }, PERFIS.curador);
  assert.equal(p.status, 201, p.texto);
  const q = await s.chamar('POST', '/estudos', { nome: 'Prospecção Norte', tipo: 'prospeccao', latitude: -15.7, longitude: -47.85 }, PERFIS.autor);
  assert.equal(q.status, 201, q.texto);
  return { s, arquivos, P: p.corpo.id, Q: q.corpo.id };
}

async function versao(c: Cenario, id: number): Promise<number> {
  return (await c.s.chamar('GET', `/estudos/${id}`, undefined, PERFIS.curador)).corpo.versao;
}

interface Linha {
  rota: string; // "MÉTODO /caminho" como no Router
  caso: string;
  preparar?: (c: Cenario) => Promise<void>;
  chamar: (c: Cenario, perfil: PerfilTeste) => Promise<{ status: number; corpo: any; texto: string }>;
  esperado: Record<Perfil, number>;
}

const so = (status: number, excecoes: Partial<Record<Perfil, number>> = {}): Record<Perfil, number> =>
  Object.fromEntries(PERFIS_MATRIZ.map((p) => [p, excecoes[p] ?? status])) as Record<Perfil, number>;

const MATRIZ: Linha[] = [
  { rota: 'GET /estudos', caso: 'lista (o sigilo vai no corpo, conferido abaixo)', chamar: (c, p) => c.s.chamar('GET', '/estudos', undefined, p), esperado: so(200) },
  { rota: 'GET /estudos/:id', caso: 'detalhe da área própria', chamar: (c, p) => c.s.chamar('GET', `/estudos/${c.P}`, undefined, p), esperado: so(404, { curador: 200, estrategico: 200, responsavel: 200 }) },
  { rota: 'GET /estudos/:id', caso: 'detalhe da prospecção', chamar: (c, p) => c.s.chamar('GET', `/estudos/${c.Q}`, undefined, p), esperado: so(200) },
  { rota: 'GET /estudos/:id/historico', caso: 'histórico da área própria', chamar: (c, p) => c.s.chamar('GET', `/estudos/${c.P}/historico`, undefined, p), esperado: so(404, { curador: 200, estrategico: 200, responsavel: 200 }) },
  { rota: 'POST /estudos', caso: 'criar prospecção', chamar: (c, p) => c.s.chamar('POST', '/estudos', { nome: `X ${p.id}`, latitude: -15.7, longitude: -47.8 }, p), esperado: so(201, { responsavel: 403, estrategico: 403, leitura: 403 }) },
  { rota: 'POST /estudos', caso: 'criar área própria', chamar: (c, p) => c.s.chamar('POST', '/estudos', { nome: `P ${p.id}`, tipo: 'propria', latitude: -15.7, longitude: -47.8 }, p), esperado: so(403, { curador: 201 }) },
  {
    rota: 'PATCH /estudos/:id', caso: 'editar notas da área própria',
    chamar: async (c, p) => c.s.chamar('PATCH', `/estudos/${c.P}`, { notas: `por ${p.id}`, versao: await versao(c, c.P) }, p),
    esperado: so(404, { curador: 200, responsavel: 403, estrategico: 403, leitura: 403 }),
  },
  {
    rota: 'PATCH /estudos/:id', caso: 'editar notas da prospecção',
    chamar: async (c, p) => c.s.chamar('PATCH', `/estudos/${c.Q}`, { notas: `por ${p.id}`, versao: await versao(c, c.Q) }, p),
    esperado: so(403, { autor: 200, curador: 200 }),
  },
  {
    rota: 'PATCH /estudos/:id', caso: 'estágio para iniciativa, com motivo',
    chamar: async (c, p) => {
      const r = await c.s.chamar('PATCH', `/estudos/${c.Q}`, { estagio: 'iniciativa', motivo: 'comitê de 2026-10', versao: await versao(c, c.Q) }, p);
      if (r.status === 200) await c.s.chamar('PATCH', `/estudos/${c.Q}`, { estagio: 'oportunidade', versao: await versao(c, c.Q) }, PERFIS.admin);
      return r;
    },
    esperado: so(403, { decisor: 200 }),
  },
  {
    rota: 'PATCH /estudos/:id/remover', caso: 'remover a área própria',
    chamar: async (c, p) => {
      const r = await c.s.chamar('PATCH', `/estudos/${c.P}/remover`, {}, p);
      if (r.status === 200) await c.s.chamar('PATCH', `/estudos/${c.P}/restaurar`, {}, PERFIS.admin);
      return r;
    },
    esperado: so(404, { curador: 200, responsavel: 403, estrategico: 403, leitura: 403 }),
  },
  {
    rota: 'PATCH /estudos/:id/restaurar', caso: 'restaurar a prospecção',
    preparar: async (c) => { await c.s.chamar('PATCH', `/estudos/${c.Q}/remover`, {}, PERFIS.admin); },
    chamar: async (c, p) => {
      const r = await c.s.chamar('PATCH', `/estudos/${c.Q}/restaurar`, {}, p);
      if (r.status === 200) await c.s.chamar('PATCH', `/estudos/${c.Q}/remover`, {}, PERFIS.admin);
      return r;
    },
    esperado: so(403, { autor: 200, curador: 200 }),
  },
  {
    rota: 'POST /estudos/importar', caso: 'prévia de KML',
    chamar: (c, p) => c.s.chamar('POST', '/estudos/importar', { upload_id: c.arquivos.subir('a.kml', KML, 'application/vnd.google-earth.kml+xml') }, p),
    esperado: so(201, { responsavel: 403, estrategico: 403, leitura: 403 }),
  },
  {
    rota: 'POST /estudos/importar/:importacao_id/aplicar', caso: 'aplicar KML como área própria',
    chamar: async (c, p) => {
      const pr = await c.s.chamar('POST', '/estudos/importar', { upload_id: c.arquivos.subir('a.kml', KML, 'application/vnd.google-earth.kml+xml') }, PERFIS.admin);
      return c.s.chamar('POST', `/estudos/importar/${pr.corpo.importacao_id}/aplicar`, { tipo: 'propria' }, p);
    },
    esperado: so(403, { curador: 200 }),
  },
];

test('matriz de acesso cobre todas as rotas de /estudos (contagem exata)', () => {
  const registradas = rotasRegistradas(estudos).map((r) => `${r.metodo} ${r.caminho}`).sort();
  const naMatriz = [...new Set(MATRIZ.map((l) => l.rota))].sort();
  assert.deepEqual(naMatriz, registradas);
});

for (const linha of MATRIZ) {
  test(`matriz: ${linha.rota} — ${linha.caso}`, async () => {
    const c = await cenario();
    try {
      await linha.preparar?.(c);
      for (const perfil of PERFIS_MATRIZ) {
        const r = await linha.chamar(c, PERFIS[perfil]);
        assert.equal(r.status, linha.esperado[perfil], `${perfil}: ${r.texto.slice(0, 200)}`);
      }
    } finally {
      await c.s.fechar();
    }
  });
}

test('sigilo na lista: a área própria some da lista e do total para quem não a lê', async () => {
  const c = await cenario();
  try {
    for (const perfil of PERFIS_MATRIZ) {
      const r = await c.s.chamar('GET', '/estudos?por_pagina=1', undefined, PERFIS[perfil]);
      const ve = ['curador', 'estrategico', 'responsavel'].includes(perfil);
      assert.equal(r.corpo.total, ve ? 2 : 1, perfil);
      const todas = await c.s.chamar('GET', '/estudos?tipo=propria', undefined, PERFIS[perfil]);
      assert.equal(todas.corpo.total, ve ? 1 : 0, perfil);
    }
    // CSV: sem área própria para ninguém até a trilha de saídas (4C).
    const csv = await c.s.chamar('GET', '/estudos?formato=csv', undefined, PERFIS.curador);
    assert.ok(!csv.texto.includes('Área da UP'));
    assert.ok(csv.texto.includes('Prospecção Norte'));
  } finally {
    await c.s.fechar();
  }
});
