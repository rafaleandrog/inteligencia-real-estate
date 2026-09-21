# Configuração da Google Sheet

## 1. Crie uma planilha pública exclusiva do app

Use uma planilha separada para o dataset público. Não misture dados privados, credenciais ou informações pessoais.

## 2. Crie/importa as abas

As três abas exigidas são:

- `LISTINGS`
- `DEVELOPMENTS`
- `ANCHORS`

Abas opcionais:

- `PRIMARY_OFFERS`
- `IVV_MONTHLY`
- `IVV_REGION` — provisionada (só cabeçalho) por **Saneamento: provisionar IVV_REGION** (v2.4.0)
- `RA_PROFILES` — **gerenciada** a partir da v2.0.0: se não existir, `setupProject()` cria
- `POLYGONS` — **gerenciada**: contornos de KML/KMZ, criada por `setupProject()`
- `ROAD_SEGMENTS`, `ROAD_SEGMENT_ALIASES`, `TRAFFIC_DAILY_TEST` — gerenciadas (v2.2.1)
- `FIPEZAP_MONTHLY`, `FIPEZAP_LOCALITY_MONTHLY`, `FIPEZAP_LOCALITY_MAP`, `FIPEZAP_SOURCES`,
  `FIPEZAP_NOTES` — gerenciadas (v2.4.0); o dado entra por **Sincronizar base FipeZAP**, que lê a
  planilha de staging cujo ID está na Script Property `FIPEZAP_STAGING_SPREADSHEET_ID` (nunca no
  código nem em `APP_META`)
- `PDAD_A_DATA`, `PDAD_A_FIGURE_MAP`, `PDAD_A_GUIDE` — carregadas à mão, lidas pelo Diagnóstico
- `LISTINGS_COVERAGE`, `PDAD_A_COVERAGE` — **operacionais**, recalculadas por inteiro pelo menu
  (v2.4.0); nunca editadas à mão

Não é preciso criar coluna à mão. A partir do Apps Script **v2.0.0**, **Configurar projeto**
provisiona de forma **aditiva** toda coluna que falta nas abas do contrato: cria a coluna nova no
fim, **preserva as existentes na posição original** e não escreve em célula nenhuma de dado. É
assim que uma planilha semeada antes da v2.0.0 ganha `regularization_status`, `sales_stage`,
`group`, `segment` e as demais — a lista completa está em **Provisionamento pós-semente**, em
[`DATA_CONTRACT.md`](DATA_CONTRACT.md).

Rodar **Configurar projeto** de novo é seguro e é o procedimento normal depois de cada atualização
do `Code.gs`: a segunda execução não altera nada.

## 3. Migre o modelo atual

```bash
node tools/reference-to-csv.mjs reference/index-v3.html migration-csv
```

Importe os CSVs nas abas de mesmo nome.

## 4. Permissão

Configure a planilha para ser visível como **Viewer** por quem precisa acessar o app público (a forma mais simples é "Anyone with the link"). Como o navegador consulta a planilha diretamente, os dados dessas abas devem ser tratados como públicos.

## 5. Copie o ID

Na URL:

```text
https://docs.google.com/spreadsheets/d/SEU_ID_AQUI/edit
```

copie somente `SEU_ID_AQUI`.

## 6. Configure o site

Em `src/config.js`:

```js
window.APP_CONFIG = {
  spreadsheetId: 'SEU_ID_AQUI',
  dataSource: 'gviz',   // 'gviz' | 'demo' | 'appsscript'
  demoMode: false,      // true força 'demo' e tem precedência
  sheets: {
    listings: 'LISTINGS',
    developments: 'DEVELOPMENTS',
    anchors: 'ANCHORS'
  },
  defaultCenter: [-15.78, -47.93],
  defaultZoom: 10
};
```

`dataSource` existe porque `demoMode` é booleano e a V1 tem **três** origens possíveis
(`docs/ARCHITECTURE.md`). `demoMode: true` continua funcionando e vence `dataSource`.

## 3.1 Migração alternativa por .xlsx

Mais direto que os CSVs: importe [`migration/imob-intelligence-backend.xlsx`](../migration/),
que já traz as 11 abas com os cabeçalhos corretos. Ver [`migration/README.md`](../migration/README.md).

## 6.1 Importar polígonos de KML/KMZ (aba `POLYGONS`)

A partir da v2.0.0 o mapa aceita contornos vindos de arquivo KML ou KMZ:

1. Suba o arquivo no Google Drive, na mesma conta da planilha.
2. Copie o ID do arquivo (o trecho entre `/d/` e `/view` na URL).
3. Na planilha, menu **Imob Intelligence → Importar polígonos de KML/KMZ**, cole o ID.

O importador converte cada *placemark* em uma linha de `POLYGONS` com a geometria em GeoJSON,
as propriedades do KML em `properties_json` e um `polygon_id` derivado por hash **estável** do
conteúdo. Reimportar o mesmo arquivo **atualiza** as linhas em vez de duplicá-las.

Anel aberto, com menos de 4 posições ou com menos de 3 pontos distintos é rejeitado com erro
legível — a geometria não entra pela metade.

## 6.2 Sincronizar Regiões Administrativas (v2.3.0)

Menu **Imob Intelligence → Sincronizar Regiões Administrativas**. Busca o limite oficial de cada RA
no GeoPortal/SEDUH, grava uma linha em `POLYGONS` com `layer_group = 'administrative_regions'` e
completa `RA_PROFILES` com código, número e área oficiais. O perfil PDAD **não é sobrescrito**: a
sincronização só preenche o que a camada oficial sabe.

A geometria já chega simplificada do GeoPortal (`maxAllowableOffset` de 0,0001° ≈ 10 m — todas as
37 RAs cabem na célula de 50 mil caracteres nesse nível). Se ainda assim não couber, a RA é pedida de
novo com 0,0002° e depois 0,0005° antes de ser descartada com aviso; a tolerância usada fica em
`properties_json.display_simplification_tolerance_deg` e a linha recebe
`quality_flag = 'official_boundary_simplified_for_sheet'`. Geometria nunca é truncada — truncada,
deixaria de ser um polígono válido sem parecer inválida.

Além de código, número e área oficiais (e densidade, quando a população já existe), a sincronização
preenche em `RA_PROFILES` as **cinco faixas etárias** (`population_age_*_pct`) agregadas da própria
aba `PDAD_A_DATA` (indicador `age_sex_distribution`, 17 categorias × sexo, ano mais recente), só
quando as 17 categorias estão publicadas; a origem fica em `notes`. `income_per_capita_brl` nunca é
tocada — a renda 2024 só existe em formato aberto para 7 RAs e continua sendo preenchida à mão.
As RAs criadas depois da PDAD 2024 (RA_36, RA_37) recebem só geometria, código, número e área.

Ao fim, um KMZ com todas as RAs é criado no Drive e o link fica em `APP_META`
(`ra_geometry_kmz_url`).

## 6.3 Sincronizar trechos rodoviários DER (v2.3.0)

Menu **Imob Intelligence → Sincronizar trechos rodoviários DER**. Para cada código de trecho presente
em `TRAFFIC_DAILY_TEST` (`001EDF0070` etc.), busca o **eixo** oficial na camada `Rodovias_2025` do
DER/DF no ArcGIS Hub, por casamento **exato** do campo `cod_distrital`. Código sem feição é pulado
com aviso — nunca vira um corredor da rota inteira — e, se uma sincronização anterior (v2.2.1, que
casava a rota por heurística) tinha deixado um corredor ativo para ele, esse corredor é **aposentado**:
a linha de `ROAD_SEGMENTS` perde `current_polygon_id` e vira `is_current = false` com `valid_to`, e o
polígono fica `inactive` com `geometry_valid_to`. Nada é apagado; a série de tráfego continua ligada
ao `road_segment_id`. A contagem fica em `APP_META.road_sync_retired_count`.

**O menu não pergunta mais um buffer** (issue #132). Ele perguntava porque o desenho era um corredor
derivado do eixo, e a resposta decidia a largura dele. O mapa passou a desenhar linha (issue #131), e
o que vai para `geometry_geojson` é o **eixo oficial, sem buffer** — `display_buffer_m = 0`. Manter a
pergunta seria manter um controle que aceita um número e não muda nada na tela.

Rode **as RAs antes das rodovias**: o eixo não depende delas, mas a ordem deixa a aba `POLYGONS`
legível.

O que a sincronização grava em `POLYGONS`, por trecho:

| Campo | Valor |
|---|---|
| `polygon_id` | o próprio `road_segment_id` (`ROADSEG_001EDF0070`) |
| `geometry_geojson` | o eixo oficial, `LineString`, igual a `source_geometry_geojson` |
| `category` / `subcategory` | `trecho_rodoviario` / `rodovia` |
| `layer_group` | `road_segments` |
| `geometry_role` | `route_axis` |
| `display_buffer_m` | `0` |
| `source_crs` | `EPSG:31983` (nativo; a geometria gravada está em `EPSG:4326`) |

E em `ROAD_SEGMENTS`, `current_polygon_id` recebe esse mesmo `polygon_id` — que é igual ao
`road_segment_id`. A regra de vínculo é **`current_polygon_id = polygon_id = road_segment_id`**.

**A cartografia de um trecho que já existe é preservada.** A sincronização é dona da geometria e da
procedência; cor, espessura e `z_index` são apresentação, e reescrevê-las a cada execução desfaria,
sem avisar, qualquer ajuste feito na planilha. Trecho novo nasce com cor da paleta (uma por trecho,
escolhida por hash do código, para não mudar quando a ordem dos códigos mudar), `fill_opacity = 0`,
`stroke_width = 4` e `z_index = 5`.

**Re-sincronizar é idempotente**: como o `polygon_id` é o id do trecho, a segunda execução encontra a
linha e a atualiza, em vez de criar outra. Há teste fixando isso
(`tests/appsscript-territorio-sync.test.js`).

A rodovia entra em `POLYGONS` — **não existe camada de rodovia separada**. `layer_group = 'road_network'`
com `geometry_role = 'display_corridor'` é o corredor com buffer da v2.2.1: continua válido na aba e
continua sendo desenhado como área, porque quem decide a forma do desenho é o **tipo da geometria**,
não o `entity_type`.

A sincronização também mantém `ROAD_SEGMENTS` (cadastro do trecho), `ROAD_SEGMENT_ALIASES` (ponte
entre o código da fonte de tráfego e o `road_segment_id`) e carimba `road_segment_id` em cada linha
de `TRAFFIC_DAILY_TEST`.

Nos dois casos, mudar a geometria oficial gera uma linha **nova** em `POLYGONS`: a anterior fica
`status = 'inactive'` com `geometry_valid_to` preenchido, nunca apagada.

## 7. Valide antes de publicar

- IDs únicos.
- Latitude/longitude numéricas.
- Preços numéricos.
- URLs de fonte válidas.
- Datas consistentes.
- `confidence_flag`/`coordinate_precision` preenchidos quando a geolocalização não for exata.

## 8. Habilitar a área administrativa (escrita) — issue #5, R4.9

O endpoint de escrita (`doPost`) só aceita gravação com um `token` válido em **cada**
requisição. Sem este passo, toda tentativa de escrita é recusada — não existe modo aberto. Este
é o mesmo modelo já usado em produção no `press-research-communications` (repo
`tipolis-sandbox`): token direto, sem sessão intermediária.

1. Na planilha, use o menu **Imob Intelligence → Configurar / trocar token de administração** —
   ele gera um token aleatório, grava direto na propriedade `ADMIN_TOKEN` e mostra o valor uma
   única vez num alerta. É o mesmo efeito do passo manual abaixo, só que sem sair da planilha.
   Alternativa manual: **Extensões → Apps Script → Configurações do projeto (ícone de engrenagem)
   → Propriedades do script**, e adicione a propriedade `ADMIN_TOKEN` com um valor aleatório e
   longo (por exemplo, gerado com `openssl rand -hex 32`). **Nunca** coloque este valor numa
   célula da planilha (R4.3, R4.8) nem no repositório (R4.1).
2. > ⚠️ **Reimplante o Web App. Salvar o código no editor NÃO atualiza o `/exec`.**
   >
   > Este é o passo que mais falha, e ele falha em silêncio: a URL `/exec` fica presa na
   > versão em que foi implantada, então o Apps Script continua servindo o código antigo
   > enquanto o editor já mostra o novo. O sintoma que chega é o token ser recusado — o que
   > manda procurar no lugar errado.
   >
   > **Implantar → Gerenciar implantações → ícone de lápis → Versão: Nova versão → Implantar.**
   >
   > Confira também **Quem tem acesso: Qualquer pessoa** — sem isso o Google devolve uma
   > página de login em vez de JSON, e nenhuma chamada do navegador funciona.

   Para não depender de lembrar disso, `admin.html` consulta `?resource=health` ao abrir e
   compara o campo `write_api` com o protocolo que ela espera. Implantação divergente vira uma
   faixa de aviso no topo da tela, dizendo exatamente qual é o problema — desatualizada, sem
   acesso público, inalcançável ou URL não configurada. Faixa some quando estiver tudo certo.
3. **Como o login funciona:**
   - `admin.html` pede o token uma vez e chama `{action: "validate", token}` — uma chamada
     barata que só confere o token, sem ler nem escrever nada.
   - Se válido, o token fica guardado em `sessionStorage` do navegador (nunca em disco, nunca
     commitado) e viaja em **toda** chamada seguinte, inclusive `create`/`update`/`delete`.
   - Um `UNAUTHENTICATED` em qualquer chamada (token errado ou rotacionado) limpa o
     `sessionStorage` e volta para a tela de login.
4. Distribua o token só para quem vai administrar os dados — quem tiver o token consegue criar,
   editar e excluir registros de `LISTINGS`/`DEVELOPMENTS`/`ANCHORS`. O modelo de auth é de
   **token compartilhado**, não de identidade por pessoa: o campo `editor` do `CHANGE_LOG` usa a
   identidade do Google quando o Apps Script consegue resolvê-la (`Session.getActiveUser()` —
   depende da configuração de "Executar como" da implantação do Web App, não é garantido) e cai
   para o nome autodeclarado no formulário quando não consegue.
5. **Rotação:** se o token vazar (compartilhado por engano, por exemplo), gere um novo valor pelo
   menu **Imob Intelligence → Configurar / trocar token de administração** (ou sobrescreva a
   propriedade `ADMIN_TOKEN` manualmente). Como não há sessão nem cache intermediário, a
   invalidação é **instantânea**: a próxima chamada de qualquer navegador com o token antigo
   recebe `UNAUTHENTICATED` e volta para a tela de login. Não há nada além disso para gerenciar.
6. Sem `ADMIN_TOKEN` configurado, nenhuma chamada autentica — é o estado seguro por padrão logo
   após importar este script numa planilha nova.
7. A interface administrativa fica em `admin.html` (`https://<seu-pages>/admin.html`), separada
   do site público (`index.html`). Ela não tem controle de acesso próprio na V1 — a única
   barreira é o token: qualquer pessoa que abra a URL vê a tela de login, mas só grava dados quem
   tiver o `ADMIN_TOKEN`. Não é uma página secreta (R4.3) — o link não é divulgado publicamente,
   mas a segurança real está no token, não em ele não ser linkado.

## 9. Runbook de sincronização v2.4.0 (issues #119, #120)

Estado que este runbook resolve (leitura pública de 2026-09-19): `validation_errors = 3370`, dos quais
3369 eram `FIPEZAP_INVALID_PERIOD` (célula Date validada como texto) e 61 avisos eram
`PRICE_M2_MISMATCH` falsos (preço como texto `"R$ 290.000"` lido como 290). O script instalado na
planilha era a v2.2.1 + um adendo FipeZAP; o repositório era a v2.3.0 sem FipeZAP. A v2.4.0 é a
união dos dois, e o estado final esperado é:

```text
GitHub Code.gs  =  Apps Script salvo  =  Apps Script implantado no /exec  =  2.4.0
```

Ordem de execução — cada passo depende do anterior:

1. **Extensões → Apps Script**: substitua TODO o conteúdo por `optional-apps-script/Code.gs` e salve.
   Não mantenha o adendo antigo abaixo: a 2.4.0 já o contém, e duas definições da mesma função
   fariam a última vencer em silêncio.
2. **Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar.** Salvar não
   atualiza o `/exec` (ver §8). Confira em `…/exec?resource=health` que `app_version` é `2.4.0`.
3. Menu **Imob Intelligence → Configurar projeto**. Cria o que falta (`category` em DATA_QUALITY,
   abas FipeZAP vazias se não existirem) e não toca dado.
4. **Saneamento: normalizar células monetárias.** LISTINGS e DEVELOPMENTS: texto `R$ …` vira
   número com formato de moeda; cada célula convertida vira uma linha do CHANGE_LOG. Texto
   **ambíguo** sem `R$` e com um ponto só (`385.000`) só é convertido quando `preço/m² informado ×
   área` decide entre R$ 385 e R$ 385.000; sem âncora, a célula é **preservada e contada** no
   resumo ("N ambígua(s) sem âncora") para correção à mão. Fórmulas são mantidas.
5. **Saneamento: normalizar períodos FipeZAP.** `period_id` → texto `YYYY-MM`, `reference_date` →
   texto `YYYY-MM-DD` em FIPEZAP_MONTHLY, FIPEZAP_LOCALITY_MONTHLY e FIPEZAP_SOURCES.
6. **Saneamento: provisionar IVV_REGION.** Cria a aba com os 12 cabeçalhos. Cole em seguida a
   semente (95 linhas, mai/2026 — `IVV_REGION` de `migration/imob-intelligence-backend.xlsx`;
   o CSV pronto para colar foi entregue junto com esta versão). `reference_month` pode ficar como
   data; `ivv_pct_published` e `ivv_pct` são ponto percentual (`12.5` = 12,5%).
7. **Validar dados agora.** Esperado: `validation_errors = 0`. Os avisos que sobram são legítimos e
   nomeados: `MISSING_OPTIONAL_SHEET` (PRIMARY_OFFERS), a fila de pesquisa de DEVELOPMENTS
   (`COVERAGE_MISSING_*`), lacunas históricas FipeZAP (`FIPEZAP_COVERAGE_GAP`) e o que a planilha
   de fato tiver de divergente. Erro que sobrar é dado a corrigir, não validador a afrouxar.
8. **Cobertura: recalcular LISTINGS_COVERAGE** e **Cobertura: recalcular PDAD_A_COVERAGE.** Abas
   operacionais, reescritas por inteiro; são a fila de pesquisa do Plano 02.
9. **Atualizar metadados.** Publica em APP_META `rows_ivv_monthly`, `rows_ivv_region`,
   `rows_fipezap_*`, `rows_pdad_data`, `rows_pdad_coverage`, `rows_listings_coverage`,
   `rows_polygons_active`, `fipezap_period_start/end`.
10. Conferência final pela leitura pública (qualquer um pode fazer, sem token):
    `…/gviz/tq?sheet=APP_META&tqx=out:csv` → `validation_errors = 0`, `app_version = 2.4.0`;
    `…/gviz/tq?sheet=FIPEZAP_MONTHLY&tq=select%20B%20limit%201` → coluna `period_id` com
    `"type":"string"`; `…/gviz/tq?sheet=LISTINGS&tq=select%20W%20limit%201` → `asking_price_brl`
    com `"type":"number"`.

Rodar qualquer passo duas vezes é seguro: as rotinas são idempotentes e registram no CHANGE_LOG só o
que mudou. Os gatilhos (`Instalar gatilhos`) só precisam ser reinstalados se ainda não existirem.

Menu completo da v2.4.0: Configurar projeto · Validar dados agora · Recalcular campos derivados ·
Saneamento (3 itens) · Cobertura (2 itens) · Sincronizar base FipeZAP · Recalcular visão FipeZAP ·
Importar polígonos · Sincronizar Regiões Administrativas · Sincronizar trechos rodoviários DER ·
Instalar gatilhos · Atualizar metadados · Configurar / trocar token · Limpar cache.
