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

/** Marcador de moeda no início ou no fim do texto ("R$ 1.234", "1.234 BRL"). */
const CURRENCY_PREFIX = /^\s*(R\$|BRL)\s*/i;
const CURRENCY_SUFFIX = /\s*(R\$|BRL)\s*$/i;
/** Sufixos de unidade que uma célula formatada carrega junto com o número. */
const UNIT_SUFFIX = /\s*(m²|m2|km²|km2|%|p\.p\.|pp)\s*$/i;

/**
 * Número a partir de qualquer representação que aparece no pipeline.
 *
 * Aceita number puro, decimal com ponto ("19117.647"), formato brasileiro
 * ("1.234,56", "R$ 1.234,56", "R$ 2.500.000"), formato inglês ("2,500,000.50") e sufixo
 * de unidade ("120 m²", "8,6%"). Devolve `null` quando não há número — nunca `NaN`,
 * para que `null` signifique "ausente" em todo o código.
 *
 * A distinção pt-BR × en depende de qual separador aparece por último: em "1.234,56"
 * a vírgula é decimal; em "1,234.56" o ponto é. É a única heurística confiável sem
 * saber a locale de origem da célula.
 *
 * Um ponto só é ambíguo — "2.500" é 2500 em pt-BR e 2.5 em JavaScript. A regra: com
 * marcador de moeda o ponto é SEMPRE milhar ("R$ 290.000" é 290000 — lido como 290, era
 * o que produzia 61 alertas falsos de preço/m² na planilha, issue #121). Sem marcador,
 * fica como decimal, que preserva os valores de precisão cheia do dataset
 * ("19117.64705882353"); a correção por âncora fica com `toPriceNumber()`.
 *
 * Espelha `toNumber_()` de optional-apps-script/Code.gs: mudou aqui, muda lá
 * (tests/appsscript-money-parity.test.js cobra a paridade).
 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = toText(value);
  if (raw === '') return null;

  const currency = CURRENCY_PREFIX.test(raw) || CURRENCY_SUFFIX.test(raw);
  // Remove símbolo de moeda, sufixo de unidade e espaços (inclusive o NBSP que o
  // Sheets insere ao formatar moeda). O que sobrar precisa ser só dígito e separador.
  let s = raw
    .replace(CURRENCY_PREFIX, '')
    .replace(CURRENCY_SUFFIX, '')
    .replace(UNIT_SUFFIX, '')
    .replace(/[\s ]/g, '');
  if (s === '' || !/^[-+]?[0-9.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const dots = (s.match(/\./g) || []).length;

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // pt-BR
    else s = s.replace(/,/g, ''); // en
  } else if (lastComma !== -1) {
    // Só vírgula. Mais de uma ("2,500,000") ou exatamente 3 dígitos depois ("1,234") é
    // separador de milhar; caso contrário é decimal ("1,5").
    const commas = (s.match(/,/g) || []).length;
    const decimals = s.length - lastComma - 1;
    s = (commas > 1 || decimals === 3) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (dots > 1 || (dots === 1 && currency && /\.\d{3}$/.test(s))) {
    // Só pontos: mais de um só pode ser milhar ("2.500.000"); um ponto com marcador de
    // moeda e três dígitos depois também ("R$ 290.000").
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
/**
 * A data existe no calendário? (issue #140)
 *
 * `2026-04-31`, `2026-02-30` e `2026-02-29` num ano comum passam por qualquer casamento de
 * FORMATO e não existem. O dia 0 do mês seguinte em UTC dá o último dia real do mês, e é a
 * definição que não depende do fuso de quem abre a página.
 *
 * Exportada porque quem AFIRMA algo sobre o calendário precisa da mesma regra: o painel de
 * trecho diz "N de M dias medidos", e duas noções de data válida no mesmo projeto seriam
 * duas verdades sobre o mesmo dado (R8.7).
 */
export function isRealCalendarDate(iso) {
  if (typeof iso !== 'string') return false;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partes) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function toDateISO(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const raw = toText(value);
  if (raw === '') return null;

  // Data que não existe no calendário é recusada em TODOS os ramos, não só reconhecida
  // pelo formato (issue #140). Antes, `2026-04-31` atravessava intacto e virava um dia
  // medido no painel do trecho, que chegava a dizer "31 de 30 dias medidos"; e um
  // `Date(2026,3,31)` do GViz rolava em silêncio para 1º de maio, trocando o mês do
  // registro sem sintoma. Conferido contra as 15 abas reais da planilha: 18.022 células
  // de data, NENHUMA recusada por esta regra — ela não muda nada do que está publicado
  // hoje, só fecha a porta.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const texto = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isRealCalendarDate(texto) ? texto : null;
  }

  const gviz = raw.match(/^Date\((\d+),(\d+),(\d+)/);
  if (gviz) {
    const [, y, m, d] = gviz;
    const dt = new Date(Date.UTC(Number(y), Number(m), Number(d)));
    if (Number.isNaN(dt.getTime())) return null;
    // `Date.UTC` NORMALIZA o excesso em vez de recusar: mês 3 dia 31 vira 1º de maio. O
    // ida-e-volta é o que denuncia isso — sem ele, a recusa viraria uma troca de data.
    if (dt.getUTCMonth() !== Number(m) || dt.getUTCDate() !== Number(d)) return null;
    return dt.toISOString().slice(0, 10);
  }

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const texto = `${br[3]}-${br[2]}-${br[1]}`;
    return isRealCalendarDate(texto) ? texto : null;
  }

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
 * Divergência tolerada entre preço/m² informado e calculado antes de virar aviso.
 * Mesmo valor de `PRICE_M2_TOLERANCE` no Code.gs: os dois lados apontam o mesmo caso.
 */
export const PRICE_M2_TOLERANCE = 0.05;

/**
 * Preço por m² com conferência (issue #121).
 *
 * `value` é o que a tela usa: o informado quando existe, senão o calculado. O informado
 * NUNCA é sobrescrito — a fonte pode usar outro critério de área (útil × total), e
 * substituí-lo em silêncio apagaria a evidência. `computed` e `divergence_pct` existem
 * para a divergência virar aviso, não correção. Área ausente, zero ou negativa devolve
 * `computed: null` em vez de `Infinity`.
 */
export function pricePerM2Check(priceValue, areaValue, informedValue) {
  const informedRaw = toNumber(informedValue);
  const informed = informedRaw !== null && informedRaw > 0 ? informedRaw : null;

  const price = toNumber(priceValue);
  const area = toNumber(areaValue);
  const computed = (price === null || area === null || area <= 0 || price <= 0) ? null : price / area;

  const divergence = (informed !== null && computed !== null)
    ? Math.abs(computed - informed) / informed
    : null;

  return {
    value: informed !== null ? informed : computed,
    informed,
    computed,
    divergence_pct: divergence,
    mismatch: divergence !== null && divergence > PRICE_M2_TOLERANCE,
  };
}

/**
 * Preço por m². Usa o valor informado quando existe; calcula a partir de preço e área
 * quando não. Área ausente, zero ou negativa devolve `null` em vez de `Infinity`.
 */
export function pricePerM2(priceValue, areaValue, informedValue) {
  return pricePerM2Check(priceValue, areaValue, informedValue).value;
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

  // Com marcador de moeda, `toNumber()` já resolveu o ponto como milhar.
  if (CURRENCY_PREFIX.test(toText(rawValue)) || CURRENCY_SUFFIX.test(toText(rawValue))) return asDecimal;
  const raw = toText(rawValue).replace(/[\s\u00a0]/g, '');
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

/**
 * Pode-se medir distância a partir deste registro? (issue #124, Plano 01 §6.7)
 *
 * Só quando a coordenada existe E a precisão declarada é exata e não rebaixada — o mesmo
 * critério de `isApproximateLocation()`, invertido. Centroide de localidade com jitter,
 * precisão ausente, pendente ou geocodificada devolvem `false`: "metrô a 420 m" calculado
 * a partir de um ponto que representa a região, não o imóvel, é um número inventado.
 * Nenhuma distância é calculada hoje; esta é a guarda que qualquer cálculo futuro precisa
 * atravessar primeiro.
 */
export function canUseForDistance(record) {
  if (!record || typeof record !== 'object') return false;
  const coord = record.coord;
  if (!coord || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) return false;
  return !isApproximateLocation(record);
}

/** Anúncio secundário. Chave: `listing_id`. */
export function normalizeListing(row) {
  const coord = toCoord(row.latitude, row.longitude);
  const price = toPriceNumber(row.asking_price_brl, {
    areaValue: row.area_m2,
    informedPriceM2Value: row.asking_price_brl_m2,
  });
  // A conferência parte do preço já corrigido: `price` e `price_m2` precisam ser
  // leituras da MESMA célula, não duas interpretações dela (issue #121).
  const priceM2 = pricePerM2Check(price, row.area_m2, row.asking_price_brl_m2);
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
    price,
    area_m2: toNumber(row.area_m2),
    price_m2: priceM2.value,
    price_m2_computed: priceM2.computed,
    price_m2_divergence_pct: priceM2.divergence_pct,
    price_m2_mismatch: priceM2.mismatch,
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
  const developmentPrice = toPriceNumber(row.current_price_brl, {
    areaValue: row.area_min_m2,
    informedPriceM2Value: row.current_price_brl_m2,
  });
  const developmentPriceM2 = pricePerM2Check(developmentPrice, row.area_min_m2, row.current_price_brl_m2);
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
    price: developmentPrice,
    price_m2: developmentPriceM2.value,
    price_m2_computed: developmentPriceM2.computed,
    price_m2_divergence_pct: developmentPriceM2.divergence_pct,
    price_m2_mismatch: developmentPriceM2.mismatch,
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
    // Classificação em dois eixos, provisionada pelo Apps Script v2.0.0 e derivada por
    // ele a partir de `category`/`subcategory`/`name` quando a célula está vazia:
    // `group` separa infraestrutura de comércio/serviço, `segment` é mais fino que
    // `category`. Vocabulário de `segment` é aberto — o backend infere 12 tipos, o
    // resto entra à mão (issues #22, #26).
    group: toText(row.group),
    segment: toText(row.segment),
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
    // Provisionadas pelo Apps Script v2.0.0 (issue #35). A COLUNA existe; o DADO pode
    // não existir ainda — a cobertura do PDAD é esparsa e a própria semente avisa
    // "not yet all 35 RAs". `null` aqui significa "não publicado", e quem renderiza
    // omite o indicador em vez de mostrar buraco.
    income_per_capita_brl: toNumber(row.income_per_capita_brl),
    population_age_0_14_pct: toNumber(row.population_age_0_14_pct),
    population_age_15_29_pct: toNumber(row.population_age_15_29_pct),
    population_age_30_44_pct: toNumber(row.population_age_30_44_pct),
    population_age_45_59_pct: toNumber(row.population_age_45_59_pct),
    population_age_60_plus_pct: toNumber(row.population_age_60_plus_pct),

    // Provisionadas pelo Apps Script v2.2.1 (issue #50). `ra_code`, `ra_number` e
    // `area_km2` vêm do limite oficial do GeoPortal; o resto é perfil PDAD, que pode
    // estar vazio numa RA recém-criada — daí `profile_status`/`quality_flag`, que
    // distinguem "não publicado" de "zero".
    ra_code: toText(row.ra_code),
    ra_number: toInteger(row.ra_number),
    area_km2: toNumber(row.area_km2),
    average_age: toNumber(row.average_age),
    female_pct: toNumber(row.female_pct),
    male_pct: toNumber(row.male_pct),
    households_total: toInteger(row.households_total),
    avg_household_size: toNumber(row.avg_household_size),
    dominant_dwelling_type: toText(row.dominant_dwelling_type),
    dominant_dwelling_type_pct: toNumber(row.dominant_dwelling_type_pct),
    dominant_tenure: toText(row.dominant_tenure),
    dominant_tenure_pct: toNumber(row.dominant_tenure_pct),
    deed_registered_pct: toNumber(row.deed_registered_pct),
    profile_reference_year: toText(row.profile_reference_year),
    profile_status: toText(row.profile_status),
    profile_source_url: toText(row.profile_source_url),
    geometry_source_url: toText(row.geometry_source_url),
    created_after_pdad_2024: toText(row.created_after_pdad_2024),
    predecessor_ra: toText(row.predecessor_ra),
    legal_reference: toText(row.legal_reference),
    quality_flag: toText(row.quality_flag),
    notes: toText(row.notes),
  };
}

/**
 * Objeto a partir de uma célula com JSON. Devolve `null` para qualquer coisa que não
 * seja um objeto JSON parseável — nunca lança.
 *
 * A célula vem de `properties_json`, que por sua vez veio de `ExtendedData` de um KML
 * de terceiro. Deixar um `JSON.parse` cru aqui faria um único arquivo malformado
 * derrubar o carregamento inteiro do dataset (R2.6).
 */
export function toJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const raw = toText(value);
  if (raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Polígono da aba POLYGONS (Apps Script v2.0.0, issues #27/#28).
 *
 * Deliberadamente **sem `kind`**: não é registro plotável como ponto, e um `kind` aqui
 * faria `flattenEntities`/`matchesFilters` tratá-lo como marcador do mapa.
 *
 * `geometry_geojson` fica como **texto**, sem parsear. Parsear é problema de quem for
 * desenhar (issue #28): um blob malformado precisa isolar aquele polígono, não
 * interromper o carregamento do dataset inteiro.
 */
export function normalizePolygon(row) {
  return {
    // --- identidade -------------------------------------------------------
    id: toText(row.polygon_id),
    name: toText(row.name),
    category: toText(row.category),
    subcategory: toText(row.subcategory),
    entity_type: toText(row.entity_type),
    entity_id: toText(row.entity_id),
    geometry_role: toText(row.geometry_role),
    ra_geo_id: toText(row.ra_geo_id),

    // --- camada -----------------------------------------------------------
    layer_group: toText(row.layer_group),

    // --- cartografia ------------------------------------------------------
    color: toText(row.color),
    fill_color: toText(row.fill_color),
    stroke_color: toText(row.stroke_color),
    fill_opacity: toNumber(row.fill_opacity),
    stroke_width: toNumber(row.stroke_width),
    z_index: toNumber(row.z_index),
    centroid_latitude: toNumber(row.centroid_latitude),
    centroid_longitude: toNumber(row.centroid_longitude),
    area_m2: toNumber(row.area_m2),
    area_ha: toNumber(row.area_ha),
    perimeter_m: toNumber(row.perimeter_m),

    // --- procedência ------------------------------------------------------
    description: toText(row.description),
    properties: toJsonObject(row.properties_json),
    source_url: toText(row.source_url),
    source_file: toText(row.source_file),
    source_system: toText(row.source_system),
    source_layer_name: toText(row.source_layer_name),
    source_feature_id: toText(row.source_feature_id),
    source_crs: toText(row.source_crs),
    source_page_verified_at: toDateISO(row.source_page_verified_at),
    confidence_flag: toText(row.confidence_flag),
    quality_flag: toText(row.quality_flag),
    geometry_hash: toText(row.geometry_hash),
    geometry_valid_from: toDateISO(row.geometry_valid_from),
    geometry_valid_to: toDateISO(row.geometry_valid_to),
    last_synced_at: toDateISO(row.last_synced_at),
    imported_at: toDateISO(row.imported_at),
    status: toText(row.status),

    // --- geometria --------------------------------------------------------
    // Os dois campos de geometria ficam como TEXTO CRU, sem JSON.parse. Um blob
    // malformado numa linha derrubaria o carregamento de todas as camadas se fosse
    // parseado aqui; o parse acontece no render, por registro, isolado (R2.6).
    geometry_type: toText(row.geometry_type),
    geometry_geojson: toText(row.geometry_geojson),
    source_geometry_type: toText(row.source_geometry_type),
    display_buffer_m: toNumber(row.display_buffer_m),
    /**
     * Geometria ORIGINAL, preservada como procedência — e **nunca desenhada**.
     *
     * Para uma rodovia ela é a LineString do eixo oficial do DER, que o mapa não sabe
     * desenhar como área: quem vai ao mapa é sempre `geometry_geojson`, o corredor com
     * buffer já validado como Polygon/MultiPolygon. Desenhar esta aqui por engano
     * mostraria uma geometria de tipo diferente do que a camada espera.
     */
    source_geometry_geojson: toText(row.source_geometry_geojson),
  };
}

/**
 * Linhas de POLYGONS -> lista. Registro sem id é descartado, como em `normalizeAll`.
 *
 * `Array.isArray` em vez de `rows || []`: esta aba é opcional e o fetch dela pode
 * falhar de formas que as três obrigatórias não falham — um `/exec` devolvendo objeto
 * de erro em vez de lista, por exemplo. `for...of` sobre um objeto lança, e uma exceção
 * aqui derrubaria o carregamento inteiro por causa de uma camada acessória (R2.6).
 */
export function normalizePolygons(rows) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const polygon = normalizePolygon(row);
    if (!polygon.id) continue;
    out.push(polygon);
  }
  return out;
}

/** Linhas cruas de `RA_PROFILES` -> mapa `ra_geo_id` -> perfil. Linha sem chave é descartada. */
export function normalizeRaProfiles(rows) {
  const byId = {};
  // Mesma guarda de `normalizePolygons`: aba opcional, entrada não confiável.
  for (const row of Array.isArray(rows) ? rows : []) {
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
  const mismatched = [];
  let dropped = 0;
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') { dropped += 1; continue; }
    const record = fn(row);
    if (!record.id) { dropped += 1; continue; }
    if (record.price_m2_mismatch) mismatched.push(record.id);
    records.push(record);
  }

  // Divergência de preço/m² é aviso com nome, nunca correção (issue #121): o publicado
  // prevalece na tela e o operador vê quais registros conferir na planilha.
  const warnings = [];
  if (mismatched.length > 0) {
    const pct = Math.round(PRICE_M2_TOLERANCE * 100);
    const sample = mismatched.slice(0, 5).join(', ');
    warnings.push(
      `${mismatched.length} registro(s) de ${entity} com preço/m² informado divergindo mais de `
      + `${pct}% do calculado (preço ÷ área); o informado prevalece. Ex.: ${sample}`
      + (mismatched.length > 5 ? '…' : '.'),
    );
  }
  return { records, dropped, warnings };
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
  { key: 'rows_ra_profiles', label: 'Regiões Administrativas', type: 'count', visibility: 'technical' },
  { key: 'rows_polygons', label: 'Polígonos', type: 'count', visibility: 'technical' },
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
