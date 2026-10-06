// A ponte entre RA_nn e RA2026_RA-romano (issue #149, R2.9): só pela ponte publicada, nunca
// por aritmética de romanos no cliente; conflito bloqueia o join em vez de "provavelmente".

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildRaCrosswalk, normalizeCrosswalkRow, toRaNn, toRaRoman, raNameConflicts, excludeRas,
  normalizeRaName, isBridgeLoaded, EMPTY_CROSSWALK,
} from '../src/territorio/ra-keys.js';

const ROWS = JSON.parse(readFileSync(new URL('./fixtures/public/ra_crosswalk.json', import.meta.url), 'utf8')).rows;

test('a ponte de fixture constrói os quatro índices sem aviso', () => {
  const cw = buildRaCrosswalk(ROWS);
  assert.deepEqual(cw.warnings, []);
  assert.deepEqual(cw.rows.map((r) => r.raGeoId), ['RA_11', 'RA_19']);
  assert.equal(cw.byRoman.get('RA2026_RA-XIX').raName, 'Candangolândia');
  assert.equal(cw.byCode.get('RA-XI').raGeoId, 'RA_11');
  assert.equal(cw.byNumber.get(19).raGeoIdRoman, 'RA2026_RA-XIX');
  assert.equal(cw.byNn.get('RA_11').raAreaKm2, 3.19116356);
});

test('toRaNn resolve qualquer grafia PELA PONTE; sem ponte, só a forma RA_nn passa', () => {
  const cw = buildRaCrosswalk(ROWS);
  assert.equal(toRaNn('RA_11', cw), 'RA_11');
  assert.equal(toRaNn('RA2026_RA-XIX', cw), 'RA_19');
  assert.equal(toRaNn('ra2026_ra-xix', cw), 'RA_19');
  assert.equal(toRaNn('RA-XI', cw), 'RA_11');
  assert.equal(toRaNn(11, cw), 'RA_11');
  assert.equal(toRaNn('19', cw), 'RA_19');
  // Forma certa, mas fora da ponte carregada: não existe, não inventa.
  assert.equal(toRaNn('RA_07', cw), null);
  assert.equal(toRaNn('RA2026_RA-VII', cw), null);
  // Sem ponte: RA_nn passa pela forma; romano NUNCA resolve (nenhuma aritmética de romanos).
  assert.equal(toRaNn('RA_07', EMPTY_CROSSWALK), 'RA_07');
  assert.equal(toRaNn('RA_07'), 'RA_07');
  assert.equal(toRaNn('RA2026_RA-VII', EMPTY_CROSSWALK), null);
  assert.equal(toRaNn('RA-VII'), null);
  assert.equal(toRaNn(7), null);
  assert.equal(toRaNn('Cruzeiro', cw), null);
  assert.equal(toRaNn(null, cw), null);
  assert.equal(toRaRoman('RA_19', cw), 'RA2026_RA-XIX');
  assert.equal(toRaRoman(11, cw), 'RA2026_RA-XI');
  assert.equal(toRaRoman('RA_19'), null);
});

test('linha inválida sai com o motivo; o par que repete chave sai inteiro', () => {
  const semNumero = normalizeCrosswalkRow({ ...ROWS[0], ra_number: null });
  assert.equal(semNumero.row, null);
  assert.match(semNumero.reason, /ra_number/);
  const idErrado = normalizeCrosswalkRow({ ...ROWS[0], ra_geo_id: 'RA_12' });
  assert.match(idErrado.reason, /ra_geo_id/);
  const romanoErrado = normalizeCrosswalkRow({ ...ROWS[0], ra_code: 'RA-XII' });
  assert.match(romanoErrado.reason, /ra_code/);

  const cw = buildRaCrosswalk([
    ...ROWS,
    { ...ROWS[0], ra_geo_id: 'RA_12', ra_number: 12, ra_code: 'RA-XI', ra_geo_id_roman: 'RA2026_RA-XI' },
    { ra_number: 'x' },
  ]);
  // RA_11 e a impostora compartilham o romano: as DUAS caem; RA_19 fica.
  assert.deepEqual(cw.rows.map((r) => r.raGeoId), ['RA_19']);
  assert.equal(cw.warnings.length, 3, cw.warnings.join('\n'));
  assert.ok(cw.warnings.some((w) => /RA_11/.test(w) && /repete/.test(w)));
  assert.ok(cw.warnings.some((w) => /ra_number/.test(w)));
  assert.equal(buildRaCrosswalk(null).rows.length, 0);
  assert.equal(buildRaCrosswalk(null).warnings.length, 1);
});

test('raNameConflicts ignora acento e caixa, e acusa nome diferente', () => {
  const cw = buildRaCrosswalk(ROWS);
  assert.equal(normalizeRaName('  CANDANGOLÂNDIA '), 'candangolandia');
  assert.deepEqual(raNameConflicts(cw, {
    raProfiles: { RA_11: { ra_name: 'CRUZEIRO' }, RA_19: { ra_name: 'Candangolandia' } },
    pdadRas: [{ raGeoId: 'RA_19', raName: 'Candangolândia' }],
  }), []);
  const conflitos = raNameConflicts(cw, {
    raProfiles: { RA_19: { ra_name: 'Guará' } },
    pdadRas: [{ raGeoId: 'RA_11', raName: 'Cruzeiro Novo' }],
  });
  assert.deepEqual(conflitos.map((c) => c.raGeoId), ['RA_11', 'RA_19']);
  assert.equal(conflitos[1].raProfiles, 'Guará');
  assert.equal(conflitos[0].pdad, 'Cruzeiro Novo');
});

test('excludeRas tira a RA de TODOS os índices sem mutar a ponte original', () => {
  const cw = buildRaCrosswalk(ROWS);
  const sem19 = excludeRas(cw, ['RA_19']);
  assert.equal(toRaNn('RA2026_RA-XIX', sem19), null);
  assert.equal(toRaNn('RA-XIX', sem19), null);
  assert.equal(toRaNn(19, sem19), null);
  assert.equal(toRaNn('RA_19', sem19), null);
  assert.equal(toRaNn('RA_11', sem19), 'RA_11');
  assert.equal(toRaNn('RA2026_RA-XIX', cw), 'RA_19', 'a original continua inteira');
  assert.equal(excludeRas(cw, []), cw);
});

test('ponte carregada e esvaziada por exclusões continua "carregada": tudo falha fechado (Codex, PR #157)', () => {
  const cw = buildRaCrosswalk(ROWS);
  assert.equal(isBridgeLoaded(cw), true);
  assert.equal(isBridgeLoaded(EMPTY_CROSSWALK), false);
  assert.equal(isBridgeLoaded(null), false);
  const vazia = excludeRas(cw, ['RA_11', 'RA_19']);
  assert.equal(vazia.byNn.size, 0);
  assert.equal(isBridgeLoaded(vazia), true, 'zero linhas não é "sem ponte"');
  assert.deepEqual(vazia.excluded, ['RA_11', 'RA_19']);
  assert.equal(toRaNn('RA_11', vazia), null, 'a forma RA_nn não passa por uma ponte esvaziada');
  assert.equal(toRaNn('RA2026_RA-XI', vazia), null);
  assert.equal(toRaNn('RA_11', EMPTY_CROSSWALK), 'RA_11', 'sem ponte, a forma basta');
  assert.equal(toRaNn('RA_11', buildRaCrosswalk(null)), null, 'rows inválido conta como ponte carregada e vazia');
  assert.equal(excludeRas(cw, ['RA_11']).excluded.length, 1);
});
