// Manifest dos arquivos públicos (`data/public/manifest.json`) — módulo puro (issue #149).
//
// O manifest é o índice de tudo que o pipeline publicou: procedência, hash, tamanho e
// orçamento de cada arquivo, cortes de classe por métrica. O cliente não desenha nada que
// não esteja aqui, e recusa arquivo cujo hash difere do declarado (R2.7).
//
// Validação defensiva: o arquivo é gerado por máquina, mas chega pela rede. Dataset
// inválido é DESCARTADO com aviso nomeado, nunca derruba a carga (R2.6); versão de
// manifest desconhecida vira manifest nulo com aviso — o site continua sem as camadas,
// dizendo por quê (R2.5, R8.64). Nada aqui toca DOM, rede ou cor.

import { toNumber, toInteger, toText, toDateISO } from '../normalize.js';
import { safeExternalUrl } from '../format.js';

/** Versão do formato que este cliente entende; o pipeline publica `manifest_version`. */
export const MANIFEST_SCHEMA_VERSION = 1;

export const FILE_ROLES = Object.freeze(['overview', 'detail', 'detail_shard', 'data']);

const ID_RE = /^[a-z][a-z0-9_]*$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.json$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Caminho relativo seguro: sem `..`, sem `//`, sem esquema, termina em `.json`. */
export function safeRelativePath(value) {
  const text = toText(value);
  if (!PATH_RE.test(text)) return null;
  const parts = text.split('/');
  if (parts.includes('..') || parts.includes('')) return null;
  return text;
}

function bboxOf(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map((v) => toNumber(v));
  if (nums.some((v) => v === null)) return null;
  if (!(nums[0] <= nums[2] && nums[1] <= nums[3])) return null;
  return nums;
}

function normalizeFile(raw, datasetId, warnings) {
  if (!isObject(raw)) {
    warnings.push(`Território (data/public): ${datasetId} tem arquivo que não é objeto; dataset descartado.`);
    return null;
  }
  const path = safeRelativePath(raw.path);
  const role = toText(raw.role);
  const bytes = toInteger(raw.bytes);
  const budgetBytes = toInteger(raw.budget_bytes);
  const sha256 = toText(raw.sha256).toLowerCase();
  const features = toInteger(raw.features);
  const problems = [];
  if (!path) problems.push(`caminho inválido ${JSON.stringify(raw.path)}`);
  if (!FILE_ROLES.includes(role)) problems.push(`role desconhecido ${JSON.stringify(raw.role)}`);
  if (bytes === null || bytes < 1) problems.push('bytes ausente');
  if (budgetBytes === null || budgetBytes < 1) problems.push('budget_bytes ausente');
  if (!SHA_RE.test(sha256)) problems.push('sha256 inválido');
  if (features === null || features < 0) problems.push('features ausente');
  if (problems.length > 0) {
    warnings.push(`Território (data/public): ${datasetId}/${raw.path ?? '?'}: ${problems.join('; ')}; dataset descartado.`);
    return null;
  }
  const zoomMin = toInteger(raw.zoom_min);
  return {
    path,
    role,
    bytes,
    budgetBytes,
    sha256,
    features,
    bbox: bboxOf(raw.bbox),
    shardKey: raw.shard_key ? toText(raw.shard_key) : null,
    shardValue: raw.shard_value ? toText(raw.shard_value) : null,
    zoomMin: zoomMin === null ? null : zoomMin,
  };
}

function normalizeSource(raw, datasetId, warnings) {
  if (!isObject(raw)) return null;
  const url = safeExternalUrl(raw.url);
  if (!url) {
    warnings.push(`Território (data/public): ${datasetId}: fonte "${toText(raw.name) || '?'}" com URL inválida; link omitido.`);
  }
  return {
    name: toText(raw.name),
    url,
    retrievedAt: toDateISO(raw.retrieved_at) || toText(raw.retrieved_at) || null,
    license: toText(raw.license) || null,
    licenseUrl: safeExternalUrl(raw.license_url),
    attributionPt: toText(raw.attribution_pt) || null,
    files: Array.isArray(raw.files) ? raw.files.map((f) => toText(f)).filter(Boolean) : [],
  };
}

function normalizeBreaks(raw, datasetId, warnings) {
  const out = {};
  if (!isObject(raw)) return out;
  for (const [metric, spec] of Object.entries(raw)) {
    const cuts = Array.isArray(spec) ? spec : isObject(spec) ? spec.breaks : null;
    const nums = Array.isArray(cuts) ? cuts.map((v) => toNumber(v)) : [];
    const ascending = nums.length > 0 && nums.every((v, i) => v !== null && (i === 0 || v > nums[i - 1]));
    if (!ascending) {
      warnings.push(`Território (data/public): ${datasetId}: cortes de "${metric}" ausentes ou não crescentes; métrica sem classes.`);
      continue;
    }
    out[metric] = {
      method: isObject(spec) ? toText(spec.method) || 'fixed' : 'fixed',
      breaks: nums,
      classes: nums.length + 1,
      n: isObject(spec) ? toInteger(spec.n) : null,
      zeroIsAbsent: isObject(spec) ? spec.zero_is_absent === true : false,
    };
  }
  return out;
}

function normalizeDataset(raw, warnings) {
  if (!isObject(raw)) {
    warnings.push('Território (data/public): entrada de dataset que não é objeto; descartada.');
    return null;
  }
  const id = toText(raw.id);
  if (!ID_RE.test(id)) {
    warnings.push(`Território (data/public): dataset com id inválido ${JSON.stringify(raw.id)}; descartado.`);
    return null;
  }
  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    warnings.push(`Território (data/public): ${id} sem arquivos; descartado.`);
    return null;
  }
  const files = [];
  for (const entry of raw.files) {
    const file = normalizeFile(entry, id, warnings);
    if (!file) return null;
    files.push(file);
  }
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file.path)) {
      warnings.push(`Território (data/public): ${id} lista ${file.path} duas vezes; descartado.`);
      return null;
    }
    seen.add(file.path);
  }
  const years = Array.isArray(raw.years) ? raw.years.map((y) => toInteger(y)).filter((y) => y !== null) : [];
  const schema = raw.schema ? safeRelativePath(raw.schema) : null;
  return {
    id,
    titlePt: toText(raw.title_pt) || id,
    version: toText(raw.version) || null,
    generatedAt: toDateISO(raw.generated_at) || toText(raw.generated_at) || null,
    contentHash: SHA_RE.test(toText(raw.content_hash)) ? toText(raw.content_hash) : null,
    schema,
    years,
    crs: toText(raw.crs) || null,
    bbox: bboxOf(raw.bbox),
    files,
    sources: Array.isArray(raw.sources) ? raw.sources.map((s) => normalizeSource(s, id, warnings)).filter(Boolean) : [],
    methodPt: toText(raw.method_pt) || null,
    raAssignmentMethod: toText(raw.ra_assignment_method) || null,
    classBreaks: normalizeBreaks(raw.class_breaks, id, warnings),
    counts: isObject(raw.counts) ? Object.fromEntries(Object.entries(raw.counts).map(([k, v]) => [k, toNumber(v)])) : {},
    qualityFlags: Array.isArray(raw.quality_flags) ? raw.quality_flags.map((f) => toText(f)).filter(Boolean) : [],
    notesPt: toText(raw.notes_pt) || null,
  };
}

/**
 * Normaliza o manifest cru. Devolve `{ manifest, warnings }`; `manifest` é `null` quando o
 * arquivo inteiro é inutilizável (não é objeto, versão desconhecida, `datasets` não é lista).
 */
export function normalizeManifest(raw) {
  const warnings = [];
  if (!isObject(raw)) {
    return { manifest: null, warnings: ['Território (data/public): manifest.json não é um objeto JSON.'] };
  }
  const version = toInteger(raw.manifest_version);
  if (version !== MANIFEST_SCHEMA_VERSION) {
    return {
      manifest: null,
      warnings: [`Território (data/public): manifest_version ${JSON.stringify(raw.manifest_version)} não é conhecida por este cliente (esperada ${MANIFEST_SCHEMA_VERSION}).`],
    };
  }
  if (!Array.isArray(raw.datasets)) {
    return { manifest: null, warnings: ['Território (data/public): manifest.json sem a lista "datasets".'] };
  }
  const datasets = [];
  const ids = new Set();
  for (const entry of raw.datasets) {
    const dataset = normalizeDataset(entry, warnings);
    if (!dataset) continue;
    if (ids.has(dataset.id)) {
      warnings.push(`Território (data/public): dataset "${dataset.id}" repetido; a segunda cópia foi ignorada.`);
      continue;
    }
    ids.add(dataset.id);
    datasets.push(dataset);
  }
  const commit = toText(raw.pipeline_commit);
  return {
    manifest: {
      schemaVersion: version,
      generatedAt: toDateISO(raw.generated_at) || toText(raw.generated_at) || null,
      pipelineVersion: toText(raw.pipeline_version) || null,
      pipelineCommit: /^[0-9a-f]{7,40}$/.test(commit) ? commit : (commit || null),
      configSha256: SHA_RE.test(toText(raw.config_sha256)) ? toText(raw.config_sha256) : null,
      attributionPt: toText(raw.attribution_pt) || null,
      datasets,
    },
    warnings,
  };
}

/** Dataset pelo id, ou `null`. */
export function datasetById(manifest, id) {
  if (!manifest || !Array.isArray(manifest.datasets)) return null;
  return manifest.datasets.find((d) => d.id === id) || null;
}

/** Os arquivos de um papel; com `bbox`, só os shards cuja caixa cruza a caixa pedida. */
export function filesFor(dataset, { role, bbox = null } = {}) {
  if (!dataset) return [];
  return dataset.files.filter((file) => {
    if (role && file.role !== role) return false;
    if (bbox && file.bbox) {
      const [minX, minY, maxX, maxY] = file.bbox;
      if (maxX < bbox[0] || bbox[2] < minX || maxY < bbox[1] || bbox[3] < minY) return false;
    }
    return true;
  });
}

/** Primeiro arquivo de um papel, ou `null`. */
export function fileFor(dataset, { role } = {}) {
  return filesFor(dataset, { role })[0] || null;
}

/** Tamanho legível em pt-BR: `1 234` → "1,2 kB"; `0` → "0 B". */
export function formatBytes(bytes) {
  const n = toNumber(bytes);
  if (n === null || n < 0) return '—';
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kB`;
  return `${n.toLocaleString('pt-BR')} B`;
}
