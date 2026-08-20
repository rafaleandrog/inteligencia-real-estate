// Conversão e normalização de registros vindos da Google Sheet, do demo.json ou do CSV.
//
// Tudo aqui é função pura: entra valor bruto, sai valor tipado. É o que dá para testar
// sem navegador e sem rede, e é onde moram os casos extremos reais do dataset
// (ver docs/DATA_CONTRACT.md).

/** Milissegundos por dia — usado na conversão de serial de planilha. */
const MS_PER_DAY = 86400000;

/** Epoch do serial de data do Excel/Sheets: 1899-12-30 (o bug do ano bissexto de 1900). */
const SHEET_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Texto normalizado. `null`, `undefined` e espaços em branco viram string vazia,
 * para que o resto do código nunca precise checar três representações de "sem valor".
 */
export function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Número a partir de qualquer representação que aparece no pipeline.
 *
 * Aceita number puro, decimal com ponto ("19117.647"), formato brasileiro
 * ("1.234,56", "R$ 1.234,56") e formato inglês ("1,234.56"). Devolve `null` quando
 * não há número — nunca `NaN`, para que `null` signifique "ausente" em todo o código.
 *
 * A distinção pt-BR × en depende de qual separador aparece por último: em "1.234,56"
 * a vírgula é decimal; em "1,234.56" o ponto é. É a única heurística confiável sem
 * saber a locale de origem da célula.
 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = toText(value);
  if (raw === '') return null;

  // Remove símbolo de moeda, sufixos de unidade e espaços (inclusive o NBSP que o
  // Sheets insere ao formatar moeda).
  let s = raw.replace(/[R$\s ]/gi, '');
  if (s === '') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // pt-BR
    else s = s.replace(/,/g, ''); // en
  } else if (lastComma !== -1) {
    // Só vírgula. Com exatamente 3 dígitos depois é separador de milhar ("1,234");
    // caso contrário é decimal ("1,5").
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    // Só pontos, mais de um: só podem ser separadores de milhar ("2.500.000").
    //
    // Com UM ponto a leitura é ambígua — "2.500" é 2500 em pt-BR e 2.5 em JavaScript —
    // e não há como decidir sem saber a locale da célula. Fica como decimal, que
    // preserva os valores de precisão cheia do dataset ("19117.64705882353").
    // Casos assim devem ser corrigidos na planilha: docs/DATA_CONTRACT.md exige
    // valor monetário como número, sem formatação dentro da célula.
    s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Inteiro, ou `null`. Trunca em direção a zero. */
export function toInteger(value) {
  const n = toNumber(value);
  return n === null ? null : Math.trunc(n);
}

/**
 * Booleano tolerante: "1", "true", "sim", "yes", "x" e o número 1 são verdadeiros;
 * "0", "false", "nao", "não", "no" e vazio são falsos.
 */
export function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  const s = toText(value).toLowerCase();
  if (s === '') return false;
  if (['1', 'true', 'sim', 'yes', 'y', 'x', 'verdadeiro'].includes(s)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'n', 'falso'].includes(s)) return false;
  const n = toNumber(s);
  return n !== null && n !== 0;
}

/**
 * Data em `YYYY-MM-DD`, ou `null`.
 *
 * Três formatos chegam aqui na prática:
 *  - ISO `2026-08-18`, vindo do demo.json e do CSV;
 *  - `Date(2026,7,18)`, que é como o GViz serializa coluna de data (mês base zero);
 *  - serial de planilha (`46252`, `46252.775`), que é o que o .xlsx de migração guarda.
 *
 * Devolve só a parte de data: a hora não é usada em nenhum lugar da V1 e mantê-la
 * criaria diferença de fuso entre a planilha e o navegador.
 */
export function toDateISO(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const raw = toText(value);
  if (raw === '') return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)/);
  if (gviz) {
    const [, y, m, d] = gviz;
    const dt = new Date(Date.UTC(Number(y), Number(m), Number(d)));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  // Serial de planilha. A faixa evita interpretar um ano solto (ex.: "2026") como serial.
  const serial = toNumber(raw);
  if (serial !== null && serial > 20000 && serial < 80000) {
    const dt = new Date(SHEET_EPOCH_MS + Math.floor(serial) * MS_PER_DAY);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Par de coordenadas validado, ou `null`.
 *
 * Devolve `null` — e não uma coordenada parcial — quando só uma das duas está
 * preenchida. Metade de uma coordenada é pior que nenhuma: colocaria o ponto no
 * lugar errado do mapa em vez de omiti-lo. Sete dos 22 empreendimentos do dataset
 * atual estão exatamente nessa situação (`spatial_usable = 0`).
 *
 * A ilha nula (0, 0) é rejeitada: no Golfo da Guiné não há imóvel do Distrito Federal.
 */
export function toCoord(latValue, lonValue) {
  const lat = toNumber(latValue);
  const lon = toNumber(lonValue);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

/**
 * Preço por m². Usa o valor informado quando existe; calcula a partir de preço e área
 * quando não. Área ausente, zero ou negativa devolve `null` em vez de `Infinity`.
 */
export function pricePerM2(priceValue, areaValue, informedValue) {
  const informed = toNumber(informedValue);
  if (informed !== null && informed > 0) return informed;

  const price = toNumber(priceValue);
  const area = toNumber(areaValue);
  if (price === null || area === null || area <= 0 || price <= 0) return null;
  return price / area;
}

/** Campos de qualidade espacial. Precisam sobreviver da planilha até a tela (R3.5). */
function spatialQuality(row) {
  return {
    confidence_flag: toText(row.confidence_flag),
    coordinate_precision: toText(row.coordinate_precision),
  };
}

/**
 * `true` quando a coordenada é aproximada e não pode ser apresentada como endereço
 * exato (R3.6). No dataset atual os 141 anúncios usam centroide de localidade com
 * jitter, então isto vale para todos eles — não é caso raro.
 */
export function isApproximateLocation(record) {
  const precision = toText(record.coordinate_precision).toLowerCase();
  const flag = toText(record.confidence_flag).toLowerCase();
  if (precision === '' && flag === '') return true; // sem declaração, assuma o pior
  return (
    precision.includes('centroid') ||
    precision.includes('jitter') ||
    precision.includes('approx') ||
    precision.includes('pending') ||
    flag.includes('low_spatial')
  );
}

/** Anúncio secundário. Chave: `listing_id`. */
export function normalizeListing(row) {
  const coord = toCoord(row.latitude, row.longitude);
  return {
    kind: 'listing',
    id: toText(row.listing_id),
    title: toText(row.title) || toText(row.address),
    property_type: toText(row.property_type),
    transaction_type: toText(row.transaction_type),
    locality: toText(row.locality),
    address: toText(row.address),
    ra_geo_id: toText(row.ra_geo_id),
    coord,
    price: toNumber(row.asking_price_brl),
    area_m2: toNumber(row.area_m2),
    price_m2: pricePerM2(row.asking_price_brl, row.area_m2, row.asking_price_brl_m2),
    bedrooms: toInteger(row.bedrooms),
    suites: toInteger(row.suites),
    parking_spaces: toInteger(row.parking_spaces),
    condo_fee_brl: toNumber(row.condo_fee_brl),
    iptu_brl: toNumber(row.iptu_brl),
    area_basis: toText(row.area_basis),
    source_url: toText(row.source_url),
    source: toText(row.portal),
    observed_at: toDateISO(row.observed_at),
    status: toText(row.status),
    ...spatialQuality(row),
  };
}

/** Empreendimento canônico. Chave: `development_id`. */
export function normalizeDevelopment(row) {
  const coord = toCoord(row.latitude, row.longitude);
  return {
    kind: 'development',
    id: toText(row.development_id),
    title: toText(row.name),
    developer_name: toText(row.developer_name),
    address: toText(row.address),
    locality: toText(row.neighborhood),
    ra_geo_id: toText(row.ra_geo_id),
    coord,
    product: toText(row.product),
    segment: toText(row.segment),
    status: toText(row.status),
    units_total: toInteger(row.units_total),
    area_min_m2: toNumber(row.area_min_m2),
    area_max_m2: toNumber(row.area_max_m2),
    price: toNumber(row.current_price_brl),
    price_m2: pricePerM2(row.current_price_brl, row.area_min_m2, row.current_price_brl_m2),
    work_progress_pct: toNumber(row.work_progress_pct),
    expected_delivery: toDateISO(row.expected_delivery),
    unit_mix: toText(row.unit_mix),
    source_url: toText(row.source_url),
    observed_at: toDateISO(row.last_verified_at),
    spatial_usable: toBoolean(row.spatial_usable),
    coordinate_status: toText(row.coordinate_status),
    quality_flag: toText(row.quality_flag),
    ...spatialQuality(row),
  };
}

/** Ponto de interesse. Chave: `place_id`. */
export function normalizeAnchor(row) {
  const coord = toCoord(row.latitude, row.longitude);
  return {
    kind: 'anchor',
    id: toText(row.place_id),
    title: toText(row.name),
    category: toText(row.category),
    subcategory: toText(row.subcategory),
    operator_name: toText(row.operator_name),
    address: toText(row.address),
    locality: toText(row.neighborhood),
    ra_geo_id: toText(row.ra_geo_id),
    coord,
    source_url: toText(row.source_url),
    coordinate_source_url: toText(row.coordinate_source_url),
    observed_at: toDateISO(row.last_verified_at),
    status: toText(row.status),
    scale_capacity: toText(row.scale_capacity),
    ...spatialQuality(row),
  };
}

/**
 * Oferta agregada do mercado primário. Chave: `id`.
 *
 * Atenção ao schema: esta aba usa `lat`/`lon`, e não `latitude`/`longitude` como as
 * outras três. A divergência está registrada em docs/DATA_CONTRACT.md.
 */
export function normalizePrimaryMarket(row) {
  const coord = toCoord(row.lat, row.lon);
  const priceMin = toNumber(row.price_min_brl);
  const ppmMin = toNumber(row.ppm_min_brl_m2);
  const ppmMax = toNumber(row.ppm_max_brl_m2);

  // Faixa de preço/m²: sem um valor único na planilha, o ponto médio da faixa é a
  // representação honesta para a mediana. Com só uma das pontas, usa a que existe.
  let priceM2 = null;
  if (ppmMin !== null && ppmMax !== null) priceM2 = (ppmMin + ppmMax) / 2;
  else if (ppmMin !== null) priceM2 = ppmMin;
  else if (ppmMax !== null) priceM2 = ppmMax;

  return {
    kind: 'primary',
    id: toText(row.id),
    title: toText(row.name),
    locality: toText(row.locality),
    address: toText(row.address),
    coord,
    price: priceMin,
    price_min_brl: priceMin,
    price_max_brl: toNumber(row.price_max_brl),
    price_m2: priceM2,
    ppm_min_brl_m2: ppmMin,
    ppm_max_brl_m2: ppmMax,
    area_min_m2: toNumber(row.area_min_m2),
    area_max_m2: toNumber(row.area_max_m2),
    bedrooms: toInteger(row.bedrooms_min),
    bedrooms_min: toInteger(row.bedrooms_min),
    bedrooms_max: toInteger(row.bedrooms_max),
    offer_count: toInteger(row.offer_count),
    expected_delivery: toDateISO(row.expected_delivery),
    source_url: toText(row.company_url),
    observed_at: toDateISO(row.observed_at),
    ...spatialQuality(row),
  };
}

/** Normalizador por nome de entidade, usado pelo loader. */
export const NORMALIZERS = {
  listings: normalizeListing,
  developments: normalizeDevelopment,
  anchors: normalizeAnchor,
  primaryMarket: normalizePrimaryMarket,
};

/**
 * Aplica o normalizador da entidade a um conjunto de linhas, descartando as que não
 * têm ID. Registro sem ID é inutilizável — não dá para referenciar, deduplicar nem
 * abrir detalhe — mas descartá-lo nunca derruba a aplicação (R2.6). O total descartado
 * volta em `dropped` para virar aviso na interface em vez de sumir em silêncio (R5.7).
 */
export function normalizeAll(entity, rows) {
  const fn = NORMALIZERS[entity];
  if (!fn) throw new Error(`entidade desconhecida: ${entity}`);

  const records = [];
  let dropped = 0;
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') { dropped += 1; continue; }
    const record = fn(row);
    if (!record.id) { dropped += 1; continue; }
    records.push(record);
  }
  return { records, dropped };
}
