// Schema dos campos editáveis pela área administrativa, por aba.
//
// Espelha WRITE_ALLOWLIST / FIELD_SCHEMA / REQUIRED_FOR_CREATE / ENUM_VALUES de
// optional-apps-script/Code.gs — a fonte de verdade real é o servidor (ele valida de
// novo, nunca confia no cliente), mas a tabela e o formulário genéricos deste módulo
// precisam saber de antemão que campos existem, o tipo de cada um e quais são
// obrigatórios na criação, para construir a UI sem esperar uma resposta de erro.
//
// tests/admin-schema.test.js mantém isto em paridade com Code.gs: divergir aqui sem
// atualizar lá (ou vice-versa) quebra o teste, do mesmo jeito que
// tests/contract.test.js já faz para REQUIRED_HEADERS.

/** Rótulo curto de cada aba, para o seletor da área administrativa. */
export const SHEET_LABELS = {
  LISTINGS: 'Anúncios secundários',
  DEVELOPMENTS: 'Empreendimentos',
  ANCHORS: 'Âncoras',
  POLYGONS: 'Contornos',
};

/** Coluna que identifica o registro em cada aba — igual a ID_FIELD em Code.gs. */
export const ID_FIELD = {
  LISTINGS: 'listing_id',
  DEVELOPMENTS: 'development_id',
  ANCHORS: 'place_id',
};

/** Vocabulário fechado de campos enum — igual a ENUM_VALUES em Code.gs. */
export const ENUM_VALUES = {
  property_type: ['apartamento', 'casa', 'casa_condominio', 'kitnet', 'predio', 'terreno'],
  category: [
    'escola', 'mobilidade', 'parque_equipamento_publico', 'saude', 'shopping_center',
    'supermercado_atacarejo', 'universidade',
  ],
  group: ['infraestrutura', 'comercio_servico'],
  building_orientation: ['vertical', 'horizontal'],
  sales_stage: ['em_construcao', 'em_lancamento', 'oferta'],
  polygon_status: ['active', 'inactive'],
};

/**
 * Abas graváveis que têm tela PRÓPRIA em vez do formulário genérico de tabela.
 *
 * POLYGONS é a única, e continua fora de `ADMIN_SHEETS` de propósito. Um formulário
 * genérico para ela seria uma caixa de texto livre pedindo GeoJSON à mão — pior que
 * nenhum formulário, e um convite ao tipo de conteúdo que `safeCellValue_()` existe
 * para conter. A issue #37 resolveu isso com **desenho no mapa**: a pessoa clica nos
 * cantos, o cliente monta a geometria (`src/admin/polygon-draw.js`) e o servidor
 * valida de novo.
 *
 * Até a #37 esta lista se chamava `DEFERRED_ADMIN_SHEETS` e significava "gravável mas
 * sem interface". O nome mudou porque o fato mudou: POLYGONS agora TEM interface, só
 * não a genérica. Manter o nome antigo faria a constante mentir.
 *
 * `tests/admin-schema.test.js` cobra que ADMIN_SHEETS ∪ CUSTOM_UI_ADMIN_SHEETS cubra o
 * `WRITE_ALLOWLIST` **exatamente**, sem sobreposição: aba gravável nova cai
 * obrigatoriamente de um dos dois lados, nunca some em silêncio.
 */
export const CUSTOM_UI_ADMIN_SHEETS = ['POLYGONS'];

/**
 * Campo derivado de preço/m² de cada aba — igual a DERIVED_PRICE_M2_FIELD em Code.gs.
 * Exibido na tabela/detalhe como somente leitura; nunca aparece no formulário de edição.
 */
export const DERIVED_PRICE_M2_FIELD = {
  LISTINGS: 'asking_price_brl_m2',
  DEVELOPMENTS: 'current_price_brl_m2',
};

/**
 * Campos editáveis de cada aba, na ordem em que aparecem no formulário.
 * `required` é avaliado só na criação — em edição, todo campo é opcional (patch).
 */
export const ADMIN_FIELDS = {
  LISTINGS: [
    { key: 'title', label: 'Título', type: 'text', required: true },
    { key: 'address', label: 'Endereço', type: 'text', required: true },
    { key: 'locality', label: 'Localidade', type: 'text', required: true },
    { key: 'ra_geo_id', label: 'Região administrativa (ID)', type: 'text', required: true },
    { key: 'property_type', label: 'Tipo de imóvel', type: 'enum:property_type', required: true },
    { key: 'transaction_type', label: 'Tipo de transação', type: 'text', required: true },
    { key: 'status', label: 'Status', type: 'text', required: true },
    { key: 'portal', label: 'Portal de origem', type: 'text', required: true },
    { key: 'source_url', label: 'URL da fonte', type: 'url', required: true },
    { key: 'source_url_type', label: 'Tipo de URL da fonte', type: 'text', required: true },
    { key: 'source_page_verified_at', label: 'Verificado em', type: 'date', required: true },
    { key: 'last_seen_at', label: 'Visto pela última vez em', type: 'date', required: true },
    { key: 'observed_at', label: 'Observado em', type: 'date', required: true },
    { key: 'latitude', label: 'Latitude', type: 'number', required: true },
    { key: 'longitude', label: 'Longitude', type: 'number', required: true },
    { key: 'coordinate_precision', label: 'Precisão da coordenada', type: 'text', required: true },
    { key: 'confidence_flag', label: 'Confiança', type: 'text', required: true },
    { key: 'asking_price_brl', label: 'Preço pedido (R$)', type: 'number', required: true },
    { key: 'area_m2', label: 'Área (m²)', type: 'number', required: true },
    { key: 'area_basis', label: 'Base da área', type: 'text', required: true },
    { key: 'bedrooms', label: 'Quartos', type: 'int', required: true },
    { key: 'quality_flag', label: 'Qualidade da coleta', type: 'text', required: true },
    { key: 'suites', label: 'Suítes', type: 'int', required: false },
    { key: 'parking_spaces', label: 'Vagas', type: 'int', required: false },
    { key: 'condo_fee_brl', label: 'Condomínio (R$)', type: 'number', required: false },
    { key: 'iptu_brl', label: 'IPTU (R$)', type: 'number', required: false },
    { key: 'regularization_status', label: 'Regularização', type: 'text', required: false },
  ],
  DEVELOPMENTS: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'address', label: 'Endereço', type: 'text', required: true },
    { key: 'neighborhood', label: 'Bairro', type: 'text', required: true },
    { key: 'confidence_flag', label: 'Confiança', type: 'text', required: true },
    { key: 'spatial_usable', label: 'Coordenada utilizável no mapa', type: 'bool', required: true },
    { key: 'last_verified_at', label: 'Verificado em', type: 'date', required: true },
    { key: 'developer_name', label: 'Construtora', type: 'text', required: false },
    { key: 'ra_geo_id', label: 'Região administrativa (ID)', type: 'text', required: false },
    { key: 'latitude', label: 'Latitude', type: 'number', required: false },
    { key: 'longitude', label: 'Longitude', type: 'number', required: false },
    { key: 'coordinate_status', label: 'Status da coordenada', type: 'text', required: false },
    { key: 'product', label: 'Produto', type: 'text', required: false },
    { key: 'segment', label: 'Segmento', type: 'text', required: false },
    { key: 'status', label: 'Status', type: 'text', required: false },
    { key: 'units_total', label: 'Total de unidades', type: 'int', required: false },
    { key: 'area_min_m2', label: 'Área mínima (m²)', type: 'number', required: false },
    { key: 'area_max_m2', label: 'Área máxima (m²)', type: 'number', required: false },
    { key: 'current_price_brl', label: 'Preço atual (R$)', type: 'number', required: false },
    { key: 'source_url', label: 'URL da fonte', type: 'url', required: false },
    { key: 'quality_flag', label: 'Qualidade da coleta', type: 'text', required: false },
    { key: 'work_progress_pct', label: 'Obra concluída (%)', type: 'number', required: false },
    { key: 'unit_mix', label: 'Mix de unidades', type: 'text', required: false },
    { key: 'expected_delivery', label: 'Entrega prevista', type: 'date', required: false },
    { key: 'sales_stage', label: 'Estágio de comercialização', type: 'enum:sales_stage', required: false },
    { key: 'building_orientation', label: 'Vertical / horizontal', type: 'enum:building_orientation', required: false },
    { key: 'regularization_status', label: 'Regularização', type: 'text', required: false },
  ],
  ANCHORS: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'category', label: 'Categoria', type: 'enum:category', required: true },
    { key: 'subcategory', label: 'Subcategoria', type: 'text', required: true },
    { key: 'operator_name', label: 'Operador', type: 'text', required: true },
    { key: 'latitude', label: 'Latitude', type: 'number', required: true },
    { key: 'longitude', label: 'Longitude', type: 'number', required: true },
    { key: 'ra_geo_id', label: 'Região administrativa (ID)', type: 'text', required: true },
    { key: 'source_url', label: 'URL da fonte', type: 'url', required: true },
    { key: 'coordinate_source_url', label: 'URL da fonte da coordenada', type: 'url', required: true },
    { key: 'confidence_flag', label: 'Confiança', type: 'text', required: true },
    { key: 'coordinate_precision', label: 'Precisão da coordenada', type: 'text', required: true },
    { key: 'last_verified_at', label: 'Verificado em', type: 'date', required: true },
    { key: 'status', label: 'Status', type: 'text', required: true },
    { key: 'address', label: 'Endereço', type: 'text', required: false },
    { key: 'neighborhood', label: 'Bairro', type: 'text', required: false },
    { key: 'scale_capacity', label: 'Capacidade/porte', type: 'text', required: false },
    { key: 'group', label: 'Grupo', type: 'enum:group', required: false },
    { key: 'segment', label: 'Segmento', type: 'text', required: false },
    { key: 'brand_name', label: 'Marca', type: 'text', required: false },
    { key: 'occupied_area_m2', label: 'Área ocupada (m²)', type: 'number', required: false },
  ],
};

/** Chaves editáveis de uma aba, na ordem do formulário. */
export function fieldKeys(sheet) {
  return (ADMIN_FIELDS[sheet] || []).map((f) => f.key);
}

/** Descritor de um campo — `undefined` se não existir ou não for editável. */
export function fieldSchema(sheet, key) {
  return (ADMIN_FIELDS[sheet] || []).find((f) => f.key === key);
}

/** As três abas cobertas pela área administrativa, na ordem do seletor. */
export const ADMIN_SHEETS = ['LISTINGS', 'DEVELOPMENTS', 'ANCHORS'];
