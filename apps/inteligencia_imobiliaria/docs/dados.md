---
titulo: Dados
descricao: Contrato de dados da app — tabelas, chaves, convenções e de onde cada coluna vem.
---

# Dados

Sucessor do `docs/DATA_CONTRACT.md` do site para a app. O desenho completo está na spec
(`docs/SPEC_URBIVERSO.md` § 5); aqui fica só o que já existe na app.

## Convenções

- Toda tabela é `restrito` (a rota genérica `/api/dados/...` fica fechada) ou `somente_leitura`;
  leitura e escrita passam pelas rotas da app.
- Cadastros têm `soft_delete` (remover vai para a lixeira da Config) e `versao` (edição com lock
  otimista: `409 CONFLITO_VERSAO` quando outra pessoa salvou antes).
- Percentual é **fração** (`0.057` = 5,7%) em coluna `_frac`; a importação divide por 100 os
  cabeçalhos antigos em pontos percentuais (`female_pct`).
- Dinheiro em BRL nominal; área em m²; coordenada `decimal(10,7)`; geometria em GeoJSON
  `[longitude, latitude]` (EPSG:4326), com a caixa envolvente em quatro colunas.
- Linha criada por importação guarda `importacao_id`, que permite desfazer a importação.
- O núcleo imobiliário (lotes, matrículas, parcelamentos) **não é copiado**: a app guarda só o
  vínculo (fase 15.1a).

## Tabelas

| Tabela | O que é | Chave natural na importação |
|---|---|---|
| `cidades` | cidades atendidas; hoje só `distrito_federal` (semente) | — |
| `localidades` | as 37 RAs do GeoPortal (semente), submercados, bairros e agregados | `tipo` + `codigo` (aceita `ra_geo_id`, `codigo_legado` `RA2026_RA-I` e nome único) |
| `localidade_perfis` | perfil por localidade e ano (sucede `RA_PROFILES`) | localidade + `ano_referencia` |
| `contornos` | geometrias (RA, KML importado, área desenhada, eixo rodoviário); sucede `POLYGONS` | `id_legado` (`polygon_id`), senão tipo + código + hash da geometria |
| `fontes_portal` | portais (`DFImoveis`, `QuintoAndar`…); a importação de anúncios cria a fonte que falta, **inativa** | `slug` |
| `buscas_portal` | URLs de resultados de uma fonte (usadas pela coleta, fase 3) | — |
| `anuncios` | mercado secundário (sucede `LISTINGS`) | `id_legado` (`listing_id`), senão a URL canônica |
| `anuncio_eventos` | criado, preço alterado, inativo, reativado, corrigido, removido, restaurado | — |
| `lancamentos` | lançamentos (sucede `DEVELOPMENTS`) | `id_legado` (`development_id`), senão o nome |
| `lancamento_eventos` | mesma forma, para lançamentos | — |
| `ancoras` | âncoras (sucede `ANCHORS`) | `id_legado` (`place_id`), senão nome + categoria |
| `uso_eventos` | telemetria mínima de abertura de tela (tabela pessoal) | — |
| `importacoes` | cada carga: arquivo (não expira), modo, contagens, rejeições, quem fez, desfazer | — |
| `coletas` | cada execução com os contadores de domínio (importação hoje; rotinas a partir da fase 3) | — |
| `cursores_rotina` | posição e trava das rotinas fatiadas (fase 3) | — |
| `achados_qualidade` | avisos não bloqueantes (ex.: `SOMA_FAIXAS_ETARIAS`), com quem resolveu | — |
| `alteracoes_cadastro` | histórico de criar, editar, remover e restaurar, com o antes e o depois; valor de atributo entra no histórico do objeto como `atr_<codigo>` | — |
| `atributos_def` | catálogo de atributos extensíveis: `codigo`, tipo, unidade, opções (só crescem), `aplica_a`, `grupo`, `ativo`; teto de 200 ativos | `codigo` |
| `atributos_valor` | um valor por objeto e atributo, só na coluna `valor_*` do tipo; `fonte`, `observado_em`, `importacao_id` | `objeto_tipo` + `objeto_id` + `atributo_id` |
| `areas_estudo` | áreas de estudo: tipo (`propria` sigilosa), estágio, responsável, autor, geometria (ponto ou polígono), localidade dominante | `nome` (CSV); geometria pelo hash (KML/KMZ) |
| `ivv_mensal` | IVV mensal (sucede `IVV_MONTHLY`): as 13 métricas em colunas; acumulados, variações e checagens publicados em `extras`, verbatim | mês + segmento + mercado |
| `ivv_regional` | IVV por localidade e faixa de quartos (sucede `IVV_REGION`); IVV em fração; `DF Total` marcado como `agregado_total` | mês + região da fonte + faixa |
| `fipezap_mensal` | FipeZap (sucede `FIPEZAP_MONTHLY`): segmento, transação, total ou localidade, preço por m², yields, variações, ranking; a visão venda × locação por localidade é montada em leitura | mês + segmento + transação + escopo + localidade da fonte |
| `procedencias` | fontes e notas do FipeZap e guia da PDAD, com as colunas da aba em `extras` | família + código |
| `vinculos_nucleo` | junção objeto da app × registro do imobiliário (só o id; nada copiado) | `objeto_tipo` + `objeto_id` + `entidade` + `nucleo_id` (entre os vivos) |

### Semente

No primeiro request a app cria a cidade e as 37 RAs com os códigos do GeoPortal
(`RA_01` … `RA_37`, romano e legado). Só cria o que falta: nunca reescreve o que uma importação
já atualizou.

### Contornos

A geometria é validada na escrita: anel fechado com ao menos quatro posições e três distintas,
linha com ao menos duas, longitude e latitude dentro da faixa (latitude fora de [-90, 90] denuncia
ordem invertida). Caixa, centroide, área e perímetro são calculados na escrita por projeção plana
local (`metricas_aproximadas = true`: apoio visual, não medida). `geometria_hash` (SHA-256 da
geometria com 7 casas) impede contorno duplicado na importação de KML/KMZ.

### Anúncios

- `url_fonte` é gravada **canônica** (sem query nem fragmento) e é única entre os vivos.
- Derivados de leitura, nunca gravados: `orientacao` (vertical para apartamento, prédio e kitnet;
  horizontal para casa, casa em condomínio e terreno), `preco_m2` (o informado quando existe, senão
  preço ÷ área), `preco_m2_calculado`, `divergencia_preco_m2_frac`, `preco_m2_divergente` (acima de
  5%) e `pode_calcular_distancia` (só coordenada exata ou ajustada à mão).
- Na importação, `sale`/`rent` viram `venda`/`locacao`, `active` vira `ativo`, e
  `locality_centroid_deterministic_jitter` vira `centroide_localidade_jitter_deterministico`.
  Preço/m² divergente vira achado `PRECO_M2_DIVERGENTE` (aviso), sem rejeitar a linha.
- Retratos mensais, grupo do mesmo imóvel e liquidez vêm `null` com
  `indisponivel: { motivo: 'fase_futura', fase: '3' }` até a coleta automática.

### Lançamentos e âncoras

- Lançamento com meia coordenada fica **fora do mapa** (`espacial_utilizavel = false`): metade de
  uma coordenada poria o ponto no lugar errado.
- `estagio_vendas` vazio é derivado do texto de status (`lançamento / em obras` → `em_lancamento`).
- O `grupo` da âncora vazio é derivado da categoria; o status antigo (`active_verified_web`,
  `em_operacao_na_camada_publicada`) vira `ativa`.
