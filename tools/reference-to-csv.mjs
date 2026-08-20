#!/usr/bin/env node
// Extrai o dataset embutido no modelo V3 e gera CSVs para importar na Google Sheet.
//
//   node tools/reference-to-csv.mjs [reference/index-v3.html] [migration-csv]
//
// Caminho de migração alternativo ao .xlsx de migration/, útil quando a referência
// for atualizada e for preciso regerar as abas a partir dela.
//
// Os cabeçalhos de saída seguem docs/DATA_CONTRACT.md, não a forma interna do V3.
// No V3 cada empreendimento primário carrega um array `offers` aninhado; a aba
// opcional PRIMARY_OFFERS preserva essas observações unitárias.

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
  PRIMARY_OFFERS: {
    headers: ['observation_id', 'development_name', 'development_id', 'market_region', 'area_m2',
      'bedrooms', 'parking_spaces', 'asking_price_brl', 'asking_price_brl_m2', 'expected_delivery',
      'company_url', 'listing_url', 'address', 'latitude', 'longitude', 'observed_at', 'source_id',
      'source_class', 'confidence_flag', 'notes'],
    rows: (D) => (D.primaryMarket || []).flatMap((e) => (Array.isArray(e.offers) ? e.offers : [])),
  },
  IVV_MONTHLY: {
    headers: ['reference_month', 'ivv_pct', 'offered_units', 'sold_units', 'launched_units',
      'launched_projects', 'offer_price_brl_m2', 'sale_price_brl_m2', 'offered_area_m2',
      'sold_area_m2', 'vgo_brl_million', 'vgv_brl_million', 'vgl_brl_million',
      'cancellations_units', 'source_id', 'source_locator', 'verified_at', 'coverage_note'],
    rows: (D) => D.ivvMonthly || [],
  },
  RA_PROFILES: {
    headers: ['ra_geo_id', 'ra_official_code', 'ra_name', 'population_total', 'dwellings_total',
      'private_dwellings_total', 'collective_dwellings_total', 'private_occupied_dwellings',
      'private_nonoccupied_dwellings', 'sector_count', 'medium_quality_sector_count',
      'review_sector_count', 'population_review_sectors', 'avg_residents_private_occupied',
      'imputed_private_occupied_pct', 'private_nonoccupied_share_pct', 'area_km2_source',
      'ra_cira', 'population_density_km2', 'review_population_share_pct',
      'pdad_economically_active_age14plus_pct', 'pdad_entrepreneurs_cnpj_pct',
      'pdad_health_plan_coverage_pct', 'pdad_higher_ed_complete_age25plus_pct',
      'pdad_literacy_age5plus_pct', 'pdad_new_household_intent_age14plus_pct',
      'pdad_private_employee_ctps_pct', 'pdad_registered_deed_owned_pct',
      'pdad_school_attendance_age4_24_pct', 'pdad_social_security_contribution_pct',
      'pdad_unemployment_share_pea_pct', 'primary_work_location',
      'primary_work_location_share_pct', 'secondary_work_location',
      'secondary_work_location_share_pct', 'pdad_reference_period', 'census_reference_period',
      'coverage_note'],
    rows: (D) => D.raProfiles || [],
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
