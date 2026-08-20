#!/usr/bin/env node
// Extrai o dataset embutido no modelo V3 e gera CSVs para importar na Google Sheet.
//
//   node tools/reference-to-csv.mjs [reference/index-v3.html] [migration-csv]
//
// Caminho de migração alternativo ao .xlsx de migration/, útil quando a referência
// for atualizada e for preciso regerar as abas a partir dela.
//
// Os cabeçalhos de saída seguem docs/DATA_CONTRACT.md, não a forma interna do V3.
// A diferença relevante está em PRIMARY_MARKET: no V3 cada empreendimento carrega um
// array `offers` aninhado; na planilha isso vira uma linha agregada com faixas
// mín./máx. em PRIMARY_MARKET e uma linha por oferta em PRIMARY_OFFERS.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recorta o objeto `const D = { … }` do HTML por contagem de chaves.
 *
 * Regex não serve: o objeto tem 600 KB de JSON com chaves dentro de strings. O
 * varredor ignora chave que esteja dentro de string ou escapada.
 */
export function extractDataObject(html) {
  const marker = html.indexOf('const D=');
  if (marker === -1) throw new Error('objeto de dados "const D=" não encontrado na referência');

  const start = html.indexOf('{', marker);
  if (start === -1) throw new Error('abertura do objeto de dados não encontrada');

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
  }
  throw new Error('objeto de dados não fecha — referência possivelmente truncada');
}

/** Escapa um valor para CSV (RFC 4180). `null` e `undefined` viram célula vazia. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Monta um CSV a partir dos cabeçalhos e das linhas. */
export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
  return `${lines.join('\n')}\n`;
}

const min = (values) => { const v = values.filter((n) => Number.isFinite(n)); return v.length ? Math.min(...v) : null; };
const max = (values) => { const v = values.filter((n) => Number.isFinite(n)); return v.length ? Math.max(...v) : null; };

/** Agrega as ofertas de um empreendimento na linha de PRIMARY_MARKET. */
function aggregatePrimary(entry) {
  const offers = Array.isArray(entry.offers) ? entry.offers : [];
  return {
    id: entry.id,
    name: entry.name,
    locality: entry.locality,
    address: entry.address,
    lat: entry.lat,
    lon: entry.lon,
    expected_delivery: entry.expected_delivery,
    company_url: entry.company_url,
    area_min_m2: min(offers.map((o) => Number(o.area_m2))),
    area_max_m2: max(offers.map((o) => Number(o.area_m2))),
    bedrooms_min: min(offers.map((o) => Number(o.bedrooms))),
    bedrooms_max: max(offers.map((o) => Number(o.bedrooms))),
    price_min_brl: min(offers.map((o) => Number(o.asking_price_brl))),
    price_max_brl: max(offers.map((o) => Number(o.asking_price_brl))),
    ppm_min_brl_m2: min(offers.map((o) => Number(o.asking_price_brl_m2))),
    ppm_max_brl_m2: max(offers.map((o) => Number(o.asking_price_brl_m2))),
    offer_count: entry.offer_count ?? offers.length,
    observed_at: offers.map((o) => o.observed_at).find(Boolean) ?? '',
    confidence_flag: offers.map((o) => o.confidence_flag).find(Boolean) ?? '',
  };
}

/** Aba de saída -> como obter suas linhas a partir do objeto do V3. */
const SHEETS = {
  LISTINGS: {
    headers: ['listing_id', 'portal', 'transaction_type', 'title', 'source_url', 'source_url_type',
      'external_id', 'portal_listing_code', 'source_page_verified_at', 'portal_date_text', 'status',
      'last_seen_at', 'property_id', 'property_type', 'address', 'locality', 'ra_geo_id', 'latitude',
      'longitude', 'coordinate_precision', 'confidence_flag', 'observed_at', 'asking_price_brl',
      'area_m2', 'area_basis', 'asking_price_brl_m2', 'bedrooms', 'suites', 'parking_spaces',
      'condo_fee_brl', 'iptu_brl', 'published_days', 'views_count', 'interested_count', 'quality_flag'],
    rows: (D) => D.listings || [],
  },
  DEVELOPMENTS: {
    headers: ['development_id', 'name', 'developer_name', 'address', 'latitude', 'longitude',
      'ra_geo_id', 'neighborhood', 'product', 'segment', 'status', 'units_total', 'area_min_m2',
      'area_max_m2', 'current_price_brl', 'current_price_brl_m2', 'source_url', 'confidence_flag',
      'quality_flag', 'spatial_usable', 'last_verified_at', 'coordinate_status', 'work_progress_pct',
      'unit_mix', 'expected_delivery'],
    rows: (D) => D.developments || [],
  },
  ANCHORS: {
    headers: ['place_id', 'name', 'category', 'subcategory', 'operator_name', 'address', 'latitude',
      'longitude', 'ra_geo_id', 'neighborhood', 'source_url', 'coordinate_source_url',
      'confidence_flag', 'coordinate_precision', 'last_verified_at', 'status', 'scale_capacity'],
    rows: (D) => D.places || [],
  },
  PRIMARY_MARKET: {
    headers: ['id', 'name', 'locality', 'address', 'lat', 'lon', 'expected_delivery', 'company_url',
      'area_min_m2', 'area_max_m2', 'bedrooms_min', 'bedrooms_max', 'price_min_brl', 'price_max_brl',
      'ppm_min_brl_m2', 'ppm_max_brl_m2', 'offer_count', 'observed_at', 'confidence_flag'],
    rows: (D) => (D.primaryMarket || []).map(aggregatePrimary),
  },
  PRIMARY_OFFERS: {
    headers: ['observation_id', 'development_name', 'development_id', 'market_region', 'area_m2',
      'bedrooms', 'parking_spaces', 'asking_price_brl', 'asking_price_brl_m2', 'expected_delivery',
      'company_url', 'listing_url', 'address', 'latitude', 'longitude', 'observed_at', 'source_id',
      'source_class', 'confidence_flag', 'notes'],
    rows: (D) => (D.primaryMarket || []).flatMap((e) => (Array.isArray(e.offers) ? e.offers : [])),
  },
  IVV_REGION: {
    headers: ['reference_month', 'market_region', 'bedroom_bucket', 'offered_units', 'sold_units',
      'ivv_pct_published', 'ivv_pct_check', 'ivv_variance_pp', 'offer_price_brl_m2',
      'sale_price_brl_m2', 'source_id', 'ivv_pct'],
    // ivv_pct é alias de compatibilidade de ivv_pct_published, usado pelo Apps Script.
    rows: (D) => (D.ivvRegion || []).map((r) => ({ ...r, ivv_pct: r.ivv_pct_published })),
  },
};

function main() {
  const htmlPath = process.argv[2] || 'reference/index-v3.html';
  const outDir = process.argv[3] || 'migration-csv';

  let html;
  try {
    html = readFileSync(htmlPath, 'utf8');
  } catch (error) {
    console.error(`erro: não foi possível ler "${htmlPath}": ${error.message}`);
    console.error('A referência V3 é a origem desta migração e precisa estar presente.');
    process.exit(1);
  }

  let D;
  try {
    D = extractDataObject(html);
  } catch (error) {
    console.error(`erro ao extrair o dataset de "${htmlPath}": ${error.message}`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  for (const [sheet, spec] of Object.entries(SHEETS)) {
    const rows = spec.rows(D);
    writeFileSync(join(outDir, `${sheet}.csv`), toCsv(spec.headers, rows));
    console.log(`${sheet.padEnd(16)} ${String(rows.length).padStart(4)} linhas -> ${join(outDir, `${sheet}.csv`)}`);
  }
  console.log(`\nImporte cada CSV na aba de mesmo nome. Ver docs/SHEET_SETUP.md.`);
}

// Só executa quando chamado direto, para que os testes possam importar as funções.
if (process.argv[1] && process.argv[1].endsWith('reference-to-csv.mjs')) main();
