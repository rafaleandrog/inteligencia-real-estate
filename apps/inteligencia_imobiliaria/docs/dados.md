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
| `importacoes` | cada carga: arquivo (não expira), modo, contagens, rejeições, quem fez, desfazer | — |
| `achados_qualidade` | avisos não bloqueantes (ex.: `SOMA_FAIXAS_ETARIAS`), com quem resolveu | — |
| `alteracoes_cadastro` | histórico de criar, editar, remover e restaurar, com o antes e o depois | — |

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
