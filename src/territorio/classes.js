// Classes por cortes fixos — módulo puro (issue #150).
//
// Os cortes vêm do manifest (`class_breaks`), nunca do dado na tela: a mesma célula cai na
// mesma classe em qualquer execução, e a legenda e a marca saem desta MESMA função (R8.42).
// Regra do pipeline (`assign_class`): valor igual ao corte cai na classe DE CIMA. Ausência
// (`null`, `NaN`, `Infinity`) é `null`, nunca classe zero; com `zeroIsAbsent`, zero também —
// é o caso dos empregos, onde o pipeline omite hexágono sem emprego e "zero" não é dado.

/** Índice da classe (0..k) de `value` para cortes crescentes `breaks` (k cortes), ou `null`. */
export function classIndexFor(value, breaks, { zeroIsAbsent = false } = {}) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (zeroIsAbsent && value === 0) return null;
  if (!Array.isArray(breaks) || breaks.length === 0) return null;
  let index = 0;
  for (const cut of breaks) {
    if (value >= cut) index += 1;
    else break;
  }
  return index;
}

/** Quantas classes `breaks` define: k cortes → k + 1 classes; sem cortes, zero. */
export function classCount(breaks) {
  return Array.isArray(breaks) && breaks.length > 0 ? breaks.length + 1 : 0;
}

/**
 * Os cortes cabem numa rampa de `rampSize` degraus? Devolve `{ ok, reason }`.
 *
 * Rampa menor que o número de classes é a falha silenciosa clássica: a classe mais alta
 * pediria um token que não existe e sairia sem cor (família da R8.70). Cortes não
 * crescentes são recusados aqui também, para a legenda nunca imprimir "350 a 100".
 */
export function ensureBreaksFit(breaks, rampSize) {
  if (!Array.isArray(breaks) || breaks.length === 0) return { ok: false, reason: 'sem cortes de classe' };
  for (let i = 1; i < breaks.length; i += 1) {
    if (!(breaks[i] > breaks[i - 1])) return { ok: false, reason: `cortes não crescentes em ${i}: ${breaks[i - 1]} → ${breaks[i]}` };
  }
  const classes = classCount(breaks);
  if (!Number.isInteger(rampSize) || rampSize < classes) {
    return { ok: false, reason: `${classes} classes para uma rampa de ${rampSize} degraus` };
  }
  return { ok: true, reason: null };
}
