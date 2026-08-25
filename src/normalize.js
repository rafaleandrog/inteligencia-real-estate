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

/**
 * Preço monetário, resolvendo a ambiguidade documentada de `toNumber()` para o caso
 * de um único ponto (`"385.000"`: milhar pt-BR sem decimais, ou `385.0`?) quando há
 * como decidir com segurança.
 *
 * `toNumber()` sozinho assume decimal nesse caso — correto para valores calculados
 * como `"19117.647"`, mas errado quando a célula guarda um preço formatado como texto
 * com separador de milhar em vez do número puro que o contrato exige. Resultado real
 * visto no dataset: um imóvel de R$ 385.000 exibido como R$ 385.
 *
 * A correção só é aplicada quando existe uma âncora confiável — preço/m² informado
 * (não calculado a partir do próprio preço ambíguo) e área — que permite comparar as
 * duas leituras possíveis (decimal × milhar) contra `preço/m² × área` e ficar com a
 * que bate. Sem essa âncora, mantém o valor decimal: é o mesmo comportamento
 * documentado de `toNumber()`, e é o correto na ausência de qualquer sinal a mais.
 */
export function toPriceNumber(rawValue, { areaValue, informedPriceM2Value } = {}) {
  const asDecimal = toNumber(rawValue);
  if (asDecimal === null) return null;

  const raw = toText(rawValue).replace(/[R$\s ]/gi, '');
  if (!/^-?\d{1,3}\.\d{3}$/.test(raw)) return asDecimal; // não é o caso ambíguo de 1 ponto

  const area = toNumber(areaValue);
  const informedPriceM2 = toNumber(informedPriceM2Value);
  if (area === null || area <= 0 || informedPriceM2 === null || informedPriceM2 <= 0) {
    return asDecimal;
  }

  const asThousands = asDecimal * 1000;
  const expected = informedPriceM2 * area;
  const decimalError = Math.abs(asDecimal - expected);
  const thousandsError = Math.abs(asThousands - expected);

  return thousandsError < decimalError ? asThousands : asDecimal;
}

/**
 * Classificação vertical/horizontal de um imóvel, derivada de `property_type`
 * (issue #31). `property_type` já é vocabulário fechado (`docs/DATA_CONTRACT.md`),
 * então dá para classificar com segurança sem depender de coluna nova no backend —
 * diferente de DEVELOPMENTS, cujo `product`/`unit_mix` são texto livre e por isso
 * não entram aqui (aguardam coluna dedicada, ver issue #31).
 */
const VERTICAL_PROPERTY_TYPES = new Set(['apartamento', 'predio', 'kitnet']);
const HORIZONTAL_PROPERTY_TYPES = new Set(['casa', 'casa_condominio', 'terreno']);

export function buildingOrientation(propertyType) {
  const key = toText(propertyType).toLowerCase();
  if (VERTICAL_PROPERTY_TYPES.has(key)) return 'vertical';
  if (HORIZONTAL_PROPERTY_TYPES.has(key)) return 'horizontal';
  return null;
}

/** Campos de qualidade espacial. Precisam sobreviver da planilha até a tela (R3.5). */
function spatialQuality(row) {
  return {
    confidence_flag: toText(row.confidence_flag),
    coordinate_precision: toText(row.coordinate_precision),
  };
}

/**
 * Precisões que descrevem geometria de fato apurada — polígono do imóvel, ponto
 * oficial de serviço geográfico, referência de edificação.
 *
 * Note o que NÃO está aqui: `park_centroid` é centroide, e `endereco_cep` resolve a
 * faixa de um CEP, não um lote. Ambos são aproximações.
 */
const EXACT_PRECISION = /(polygon_reference_point|building_reference_point|official_wfs_point)/;

/**
 * Marcadores que rebaixam a confiança espacial mesmo quando a precisão parece boa.
 * `high_attributes_medium_coordinate` é o caso exemplar: atributo confiável,
 * coordenada não.
 */
const DOWNGRADING_FLAG =
  /(low_spatial|medium_spatial|medium_coordinate|medium_high|user_supplied|approx|pending|centroid|jitter)/;

/**
 * `true` quando a coordenada é aproximada e não pode ser apresentada como endereço
 * exato (R3.6).
 *
 * A lógica **falha fechado**: só devolve `false` — ou seja, só autoriza a interface a
 * dizer "localização verificada" — quando a precisão declara explicitamente uma
 * geometria apurada E nenhum flag a rebaixa. Qualquer outra coisa, inclusive campo
 * vazio ou vocabulário novo que ninguém previu, é tratada como aproximada.
 *
 * A versão anterior fazia o contrário: procurava marcadores de imprecisão e assumia
 * exatidão na ausência deles. Com isso, os 15 empreendimentos mapeáveis do dataset
 * — que têm `coordinate_precision` vazio e flags como
 * `medium_spatial_high_attributes` ou `user_supplied_reference` — eram todos
 * anunciados como "Localização verificada". Afirmar precisão que o dado não tem é
 * pior do que não afirmar nada.
 */
export function isApproximateLocation(record) {
  const precision = toText(record.coordinate_precision).toLowerCase();
  const flag = toText(record.confidence_flag).toLowerCase();
  const status = toText(record.coordinate_status).toLowerCase();

  const exact = EXACT_PRECISION.test(precision);
  const downgraded = DOWNGRADING_FLAG.test(flag) || DOWNGRADING_FLAG.test(status) ||
    /geocode/.test(status); // geocodificação de endereço não é o lote

  return !(exact && !downgraded);
}

/** Anúncio secundário. Chave: `listing_id`. */
export function normalizeListing(row) {
  const coord = toCoord(row.latitude, row.longitude);
  return {
    kind: 'listing',
    id: toText(row.listing_id),
    title: toText(row.title) || toText(row.address),
    property_type: toText(row.property_type),
    // Derivado de property_type, sem depender de coluna nova (issue #31).
    building_orientation: buildingOrientation(row.property_type),
    transaction_type: toText(row.transaction_type),
    locality: toText(row.locality),
    address: toText(row.address),
    ra_geo_id: toText(row.ra_geo_id),
    coord,
    price: toPriceNumber(row.asking_price_brl, {
      areaValue: row.area_m2,
      informedPriceM2Value: row.asking_price_brl_m2,
    }),
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
    // Coluna ainda não existe na planilha (issue #32) — leitura preparatória, mesmo
    // padrão de `segment` em #22: ausência normaliza para string vazia sem quebrar.
    regularization_status: toText(row.regularization_status),
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
    // Colunas ainda não existem na planilha (issues #30 e #32) — leitura
    // preparatória; `product`/`unit_mix` são texto livre demais para derivar com
    // segurança (diferente de LISTINGS, onde property_type é vocabulário fechado).
    sales_stage: toText(row.sales_stage),
    building_orientation: toText(row.building_orientation) || null,
    regularization_status: toText(row.regularization_status),
    units_total: toInteger(row.units_total),
    area_min_m2: toNumber(row.area_min_m2),
    area_max_m2: toNumber(row.area_max_m2),
    price: toPriceNumber(row.current_price_brl, {
      areaValue: row.area_min_m2,
      informedPriceM2Value: row.current_price_brl_m2,
    }),
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
    // Classificação de segmento mais fina que `category`, a ser preenchida no
    // backend/planilha em etapa posterior (issue #22). Coluna opcional: registro sem
    // segmento continua normalizando e aparecendo no mapa normalmente.
    segment: toText(row.segment),
    // Colunas ainda não existem na planilha (issue #39) — leitura preparatória,
    // mesmo padrão de `segment` em #22.
    brand_name: toText(row.brand_name),
    occupied_area_m2: toNumber(row.occupied_area_m2),
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
 * Perfil de uma Região Administrativa, vindo da aba opcional `RA_PROFILES`
 * (issue #33/#34). Diferente de LISTINGS/DEVELOPMENTS/ANCHORS, não é um registro
 * plotável no mapa (sem `kind`, sem coordenada) — é uma tabela de enriquecimento,
 * consultada pelo `ra_geo_id` que os três tipos de registro já carregam.
 *
 * Só os campos já publicados na planilha hoje (nome, população, densidade) são
 * lidos. Renda per capita e faixa etária não existem em `RA_PROFILES` ainda —
 * ver issue #35 — e por isso não aparecem aqui: inventar a chave adiantado só
 * criaria a ilusão de que o dado já existe.
 */
export function normalizeRaProfile(row) {
  return {
    ra_geo_id: toText(row.ra_geo_id),
    ra_name: toText(row.ra_name),
    population_total: toInteger(row.population_total),
    population_density_km2: toNumber(row.population_density_km2),
  };
}

/** Linhas cruas de `RA_PROFILES` -> mapa `ra_geo_id` -> perfil. Linha sem chave é descartada. */
export function normalizeRaProfiles(rows) {
  const byId = {};
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    const profile = normalizeRaProfile(row);
    if (!profile.ra_geo_id) continue;
    byId[profile.ra_geo_id] = profile;
  }
  return byId;
}

/** Normalizador por nome de entidade, usado pelo loader. */
export const NORMALIZERS = {
  listings: normalizeListing,
  developments: normalizeDevelopment,
  anchors: normalizeAnchor,
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

// --- APP_META --------------------------------------------------------------
//
// A aba APP_META é escrita pelo Apps Script e descreve o dataset em si: quando mudou,
// que versão é, se passou na validação. Não é dado de mercado — é a procedência do
// dado de mercado, e é o que permite a alguém confiar no que está vendo.

/**
 * Como cada chave é tipada e rotulada na tela. A ordem aqui é a ordem de exibição.
 *
 * Os rótulos são curtos de propósito: o painel tem 300 px e o título "Sobre estes
 * dados" já dá o contexto. "Dados atualizados em" quebrava em três linhas.
 */
/**
 * `visibility: 'summary'` fica sempre visível — é a única informação de procedência
 * que interessa a quem está pesquisando imóvel ("quando os dados foram atualizados").
 * `visibility: 'technical'` (o resto: versão do dataset, status/contagens de
 * validação, versão do app) é jargão de pipeline e só aparece dentro do
 * `<details>` "Detalhes técnicos", para quem opera ou audita os dados (issue #19).
 */
const APP_META_FIELDS = [
  { key: 'last_data_change_at', label: 'Atualizado em', type: 'date', visibility: 'summary' },
  { key: 'dataset_version', label: 'Dataset', type: 'version', visibility: 'technical' },
  { key: 'validation_status', label: 'Qualidade', type: 'status', visibility: 'technical' },
  { key: 'last_validation_at', label: 'Validado em', type: 'date', visibility: 'technical' },
  { key: 'validation_errors', label: 'Erros', type: 'count', visibility: 'technical' },
  { key: 'validation_warnings', label: 'Avisos', type: 'count', visibility: 'technical' },
  { key: 'rows_listings', label: 'Anúncios', type: 'count', visibility: 'technical' },
  { key: 'rows_developments', label: 'Empreendimentos', type: 'count', visibility: 'technical' },
  { key: 'rows_anchors', label: 'Âncoras', type: 'count', visibility: 'technical' },
  { key: 'app_version', label: 'App', type: 'version', visibility: 'technical' },
];

/** Rótulo e tom de cada `validation_status` conhecido. */
const VALIDATION_STATUS = {
  ok: { label: 'OK', tone: 'ok' },
  warning: { label: 'Com avisos', tone: 'warning' },
  error: { label: 'Com erros', tone: 'error' },
  dirty: { label: 'Pendente de revalidação', tone: 'dirty' },
};

/**
 * Converte a APP_META bruta num objeto tipado, contendo **apenas as chaves presentes**.
 *
 * Aceita as duas formas em que ela chega: as linhas `{ key, value, updated_at }` do
 * GViz e o objeto `{ chave: valor }` do endpoint do Apps Script. Chave ausente é
 * omitida em vez de virar `null` — quem renderiza precisa distinguir "não publicado"
 * de "publicado como vazio", e um `null` no meio apagaria essa diferença.
 *
 * Chave publicada duas vezes com valores diferentes também é omitida: ver
 * `appMetaConflicts`.
 */
function flattenAppMeta(raw) {
  const flat = {};
  const conflicts = new Set();
  if (!raw) return { flat, conflicts };

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const key = toText(row.key);
      if (!key) continue;

      if (key in flat) {
        // A PRIMEIRA ocorrência vence, para acompanhar o `setMeta_()` do Apps Script,
        // que atualiza a primeira linha encontrada. Deixar a última vencer faria uma
        // linha duplicada antiga sobrepor o valor recém-escrito.
        if (toText(flat[key]) !== toText(row.value)) conflicts.add(key);
        continue;
      }
      flat[key] = row.value;
    }
  } else if (typeof raw === 'object') {
    Object.assign(flat, raw);
  }

  return { flat, conflicts };
}

/**
 * Chaves de APP_META publicadas mais de uma vez com valores divergentes.
 *
 * A planilha é editável à mão, então nada impede duas linhas `validation_status`.
 * Quem consome usa isto para avisar o operador — a divergência é um problema de dado
 * que precisa ser corrigido na planilha, não silenciado na tela.
 */
export function appMetaConflicts(raw) {
  return [...flattenAppMeta(raw).conflicts].sort();
}

export function normalizeAppMeta(raw) {
  if (!raw || (typeof raw !== 'object')) return {};

  const { flat, conflicts } = flattenAppMeta(raw);
  const out = {};
  for (const { key, type } of APP_META_FIELDS) {
    // Chave duplicada com valores divergentes é omitida em vez de exibida.
    // Escolher um dos lados apresentaria como certo um dado sobre o qual a própria
    // planilha se contradiz — e no caso de `validation_status` significaria mostrar
    // "OK" enquanto a validação registrou erro (R8.16).
    if (conflicts.has(key)) continue;

    const value = flat[key];
    if (value === null || value === undefined || toText(value) === '') continue;

    if (type === 'date') {
      const iso = toDateISO(value);
      if (iso) out[key] = iso; // data ilegível é omitida, não exibida crua
    } else if (type === 'count') {
      const n = toInteger(value);
      if (n !== null) out[key] = n;
    } else {
      out[key] = toText(value);
    }
  }
  return out;
}

/**
 * Linhas prontas para a tela, na ordem de `APP_META_FIELDS` e só para o que existe.
 *
 * `tone` classifica o estado da validação para o indicador colorido. Status
 * desconhecido recebe `unknown`, **nunca** o tom de sucesso: um vocabulário novo que
 * ninguém previu não pode ser apresentado como aprovação (R8.16).
 */
export function appMetaRows(meta) {
  const source = meta || {};
  const rows = [];

  for (const { key, label, type, visibility } of APP_META_FIELDS) {
    if (!(key in source)) continue;
    const raw = source[key];

    if (type === 'status') {
      const known = VALIDATION_STATUS[toText(raw).toLowerCase()];
      rows.push({
        key,
        label,
        type,
        visibility,
        value: known ? known.label : toText(raw),
        tone: known ? known.tone : 'unknown',
      });
      continue;
    }

    // Datas saem em ISO, que é o formato do contrato. Traduzir para pt-BR é
    // apresentação, e mora em src/format.js — este módulo não depende daquele.
    rows.push({
      key,
      label,
      type,
      visibility,
      value: type === 'version' ? `v${toText(raw)}` : String(raw),
      tone: null,
    });
  }
  return rows;
}
