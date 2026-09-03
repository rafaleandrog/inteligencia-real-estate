/**
 * Configuração da aplicação.
 *
 * Script global e não módulo, de propósito: quem edita este arquivo para trocar a
 * planilha não precisa entender `import`. É o formato documentado em
 * docs/SHEET_SETUP.md e na aba README da planilha.
 *
 * NÃO coloque secret aqui. Este arquivo é servido publicamente pelo GitHub Pages.
 * O ID da planilha e a URL do Web App são públicos por design — a arquitetura inteira
 * depende de o navegador ler a planilha direto. Qualquer outro identificador não é
 * (docs/ENGINEERING_RULES.md, R4.1 e R4.2).
 */
window.APP_CONFIG = {
  /** ID da Google Sheet pública. Trecho entre /d/ e /edit da URL. */
  spreadsheetId: '1sYwfgAiXBUwpY5P4PZzRDVNLnhDwpxMmW-UJTHxoR-A',

  /**
   * Aba que o link do selo de origem abre (issue #90).
   *
   * É ponteiro de aba, não identificador: `gid` que não existe mais é ignorado pelo Google,
   * que abre a primeira aba. Degradação inofensiva — e é por isso que o link não precisa ser
   * mantido em sincronia com a estrutura da planilha.
   */
  spreadsheetGid: '2026090203',

  /**
   * Origem dos dados:
   *   'gviz'       Google Visualization Query direto na planilha — caminho principal
   *   'demo'       data/demo.json — demonstração e desenvolvimento offline
   *   'appsscript' Web App do Apps Script — estratégia alternativa
   */
  dataSource: 'gviz',

  /**
   * Atalho retrocompatível. `true` força `dataSource: 'demo'` e tem precedência,
   * porque é o que docs/SHEET_SETUP.md e a aba README da planilha mandam usar.
   */
  demoMode: false,

  /** URL /exec do Web App. Usada apenas quando dataSource === 'appsscript'. */
  appsScriptUrl:
    'https://script.google.com/macros/s/AKfycbzQtHZQk6uPPMdV3hSThM7p1exJV3DS2U79GSkN37295eySi4Z1-0ZUK0YKjE95SM6CEA/exec',

  /** Caminho do dataset de demonstração. Relativo, para funcionar no GitHub Pages. */
  demoUrl: './data/demo.json',

  /** Abas obrigatórias. Ausência de qualquer uma é erro (R2.5). */
  sheets: {
    listings: 'LISTINGS',
    developments: 'DEVELOPMENTS',
    anchors: 'ANCHORS',
  },

  /**
   * Aba de metadados do dataset, escrita pelo Apps Script e exibida na interface.
   *
   * Só passa a existir depois que `setupProject()` roda na planilha. Enquanto não
   * existir ou estiver vazia, o bloco de metadados simplesmente não aparece — a
   * aplicação não depende dela para funcionar.
   */
  metaSheet: 'APP_META',

  /**
   * Aba de indicadores por Região Administrativa (issue #33/#34). Opcional: ausência
   * ou falha ao buscá-la vira aviso, nunca erro (R2.5) — o filtro por RA (#33) segue
   * funcionando com o código bruto de `ra_geo_id` como rótulo, só sem o
   * enriquecimento de nome/população/densidade de #34.
   */
  raProfilesSheet: 'RA_PROFILES',

  /**
   * Aba de contornos importados de KML/KMZ (issue #28). Opcional pelo mesmo motivo e
   * com o mesmo tratamento de `raProfilesSheet`: ausência ou falha vira aviso, nunca
   * erro (R2.5). A planilha pode legitimamente não ter nenhum polígono importado —
   * nesse caso a camada simplesmente não aparece, sem mensagem de erro.
   */
  polygonsSheet: 'POLYGONS',

  /**
   * Três abas do backend v2.2.0 para tráfego em rodovias-corredor (issue #62, bloco
   * C). Opcionais pelo mesmo motivo de `raProfilesSheet`/`polygonsSheet`: falha ou
   * ausência de qualquer uma vira aviso, nunca erro (R2.5) — o mapa e o dashboard
   * continuam funcionando sem o painel de tráfego.
   *
   *   ROAD_SEGMENTS         identidade permanente do trecho — NÃO é a geometria.
   *   ROAD_SEGMENT_ALIASES  ponte entre código externo do DER (`source_segment_code`)
   *                         e o `road_segment_id` permanente, para que a renumeração
   *                         de um trecho na fonte não quebre a série histórica.
   *   TRAFFIC_DAILY_TEST    série temporal (fluxo diário por sentido). Nunca duplica
   *                         geometria — a geometria já existe em `polygonsSheet`,
   *                         referenciada por `ROAD_SEGMENTS.current_polygon_id`.
   *
   * Estado atual do piloto: 5 trechos, 5 aliases, 100 registros diários (5 trechos ×
   * 20 dias de abril/2026). `road_sync_synced_count = 0` — nenhum trecho tem
   * geometria sincronizada ainda, então `current_polygon_id` não resolve para nenhum
   * `POLYGONS.polygon_id` real por enquanto; isso não impede o trecho de carregar,
   * só não tem onde ser desenhado (ver src/traffic/link.js).
   */
  roadSegmentsSheet: 'ROAD_SEGMENTS',
  roadSegmentAliasesSheet: 'ROAD_SEGMENT_ALIASES',
  trafficDailySheet: 'TRAFFIC_DAILY_TEST',

  /**
   * Série mensal do mercado residencial do DF — o IVV (issue #56, bloco B). Opcional
   * pelo mesmo motivo e com o mesmo tratamento das anteriores: falha ou ausência vira
   * aviso, nunca erro (R2.5), e o mapa continua abrindo sem a seção de mercado.
   *
   * Diferença que vale registrar: esta aba **não tem contrato no Apps Script**. No
   * `Code.gs` v2.2.0 ela está em `OPTIONAL_SHEETS` e `ALLOWED_DATASETS`, mas não em
   * `REQUIRED_HEADERS`, `MANAGED_EXTENSION_SHEETS` nem `FIELD_SCHEMA` — `setupProject()`
   * não a provisiona e `validateAll()` nunca a valida. As colunas são declaradas em
   * `src/ivv/normalize-ivv.js` e em docs/DATA_CONTRACT.md, e o normalizador NOMEIA em
   * aviso toda coluna que a aba trouxer e o contrato não declarar.
   */
  ivvMonthlySheet: 'IVV_MONTHLY',

  /**
   * Aba `IVV_REGION` (issue #87): IVV por Região Administrativa e faixa de quartos.
   *
   * Buscada porque a tela a renderiza. Um mês só, 95 linhas — é retrato, não série. Ausência
   * ou falha vira aviso, nunca erro: a tela do Mercado continua inteira sem ela (R2.5).
   */
  ivvRegionSheet: 'IVV_REGION',

  /**
   * Abas previstas para as próximas fases.
   *
   * A tela da V1 não lê PRIMARY_OFFERS/IVV_REGION, e por isso não são buscadas no
   * carregamento: seriam requisições por abertura de página para dado que ninguém
   * renderiza. Esta lista existe como declaração do que a planilha contém, e quem
   * verifica a presença delas é o `validateAll()` do Apps Script, que roda do lado da
   * planilha e registra o resultado em DATA_QUALITY.
   *
   * RA_PROFILES saiu daqui porque passou a ser buscada de verdade — ver
   * `raProfilesSheet` acima. IVV_MONTHLY saiu pelo mesmo motivo (issue #56) — ver
   * `ivvMonthlySheet`. IVV_REGION saiu na issue #87 — ver `ivvRegionSheet`.
   *
   * Quando uma das restantes entrar na interface, ela é buscada aqui e sua ausência
   * vira aviso — nunca erro, porque a aplicação não pode cair por causa de aba futura
   * vazia (R2.5).
   */
  optionalSheets: ['PRIMARY_OFFERS'],

  /** Centro inicial do mapa: Distrito Federal. */
  defaultCenter: [-15.78, -47.93],
  defaultZoom: 10,
};
