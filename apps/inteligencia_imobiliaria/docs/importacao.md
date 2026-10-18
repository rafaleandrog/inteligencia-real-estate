---
titulo: Importação
descricao: Como os dados entram na app — CSV com prévia, aplicar e desfazer; KML/KMZ de contornos; carga por agente.
---

# Importação

Todo dado entra pelo mesmo fluxo, com as mesmas validações e o mesmo registro em
**Operação › Importações**.

## Para quem usa

1. **Escolha a tabela e o modo** ("Ignorar", "Atualizar" ou "Recusar se já existir") e envie o CSV.
   "Baixar modelo" traz o cabeçalho esperado. O CSV pode ter `;` ou `,`, com ou sem BOM; os
   cabeçalhos da planilha antiga são aceitos (`ra_geo_id`, `polygon_id`, `female_pct`…).
2. **Prévia.** O arquivo é lido e validado por inteiro, sem gravar nada: quantas linhas entram,
   quantas atualizam, quantas são ignoradas e cada rejeição com linha, coluna e motivo. Colunas
   que a app calcula (como `versao` ou `id`) e colunas desconhecidas são ignoradas com aviso, sem
   rejeitar a linha.
3. **Valor padrão.** Se uma coluna obrigatória está vazia nas linhas rejeitadas (o caso do ano do
   perfil das RAs), a tela oferece declarar um valor padrão. Ele fica gravado na importação e só
   preenche célula vazia.
4. **Aplicar.** Grava as linhas válidas em lotes de 500. A contagem sempre fecha:
   inseridas + atualizadas + ignoradas + rejeitadas = linhas do arquivo.
5. **Desfazer** (só o admin da app): manda para a lixeira as linhas que a importação criou e que
   ninguém editou depois. Linhas atualizadas por ela não voltam ao valor anterior.

**Atributos no mesmo CSV.** Uma coluna `atr_<codigo>` leva o valor do atributo `<codigo>` do
catálogo para o objeto da linha (anúncios, lançamentos, âncoras e contornos). A prévia confere que o
atributo existe, está ativo e se aplica ao objeto; atributo desconhecido é coluna ignorada com aviso,
e valor fora do tipo rejeita a linha com o motivo. Célula vazia não apaga valor gravado. O modelo
baixado traz as colunas `atr_<codigo>` dos atributos ativos, e o desfazer apaga os valores que a
importação gravou e ninguém editou depois.

Reimportar o mesmo arquivo com "Ignorar" não duplica nada: a chave natural de cada tabela está
em [Dados](dados.md).

**Contornos em KML, KMZ ou GeoJSON** entram pelo Cadastro › Contornos: a prévia lista as feições
(nome, tipo, vértices, erros); aplicar cria os contornos sem duplicar pela geometria.

## Migração da planilha

A migração nunca importa a planilha viva: importa um **retrato datado**, gerado por
`node scripts/exportar-planilha.mjs [AAAA-MM-DD]` na raiz do repositório (GViz, a mesma consulta do
site; a planilha precisa estar compartilhada para leitura). O retrato fica em
`migracao/AAAA-MM-DD/<aba>.csv` com `SHA256SUMS`, **fora do git**. Cada passo é uma importação pela
Operação › Importações (ou pela carga por agente), sem edição manual do CSV:

| Passo | Aba | Tabela | Observação |
|---|---|---|---|
| 0 | — | `cidades`, `localidades` (37 RAs) | semente da app, automática |
| 1 | `RA_PROFILES` | `localidade_perfis` (e `localidades` em "Atualizar", para nomes e área) | o ano do perfil está vazio na planilha: declare `ano_referencia` como valor padrão |
| 2 | `ra_crosswalk.json` | `localidades.codigo_legado` | já vem na semente |
| 3 | `FIPEZAP_LOCALITY_MAP` | `localidades` | vira submercado (ou agregado) com a RA como pai; o nome da fonte fica em `nome_fonte` |
| 4 | `POLYGONS` | `contornos` | |
| 5 | `ANCHORS` | `ancoras` | |
| 6 | `LISTING_SOURCES` | `fontes_portal` | se faltar, a importação de anúncios cria a fonte, inativa |
| 7 | `LISTINGS` | `anuncios` | grava o evento `criado` de cada anúncio |
| 10 | `DEVELOPMENTS` | `lancamentos` | |

Aceite de cada passo: `total_linhas = inseridas + atualizadas + ignoradas + rejeitadas`, e cada
rejeição listada com motivo. Até a coleta automática (fase 3), a planilha continua sendo a fonte de
verdade dos anúncios: manter a app em dia é reimportar o retrato seguinte em "Atualizar" pela chave
natural (`id_legado`). Cada aplicar registra uma execução em Operação › Execuções.

## Para o administrador

- Importar exige o papel **operador**; desfazer, nível **admin** da app.
- O arquivo da importação fica guardado (não expira) como evidência da carga.

## Carga por agente (spec 11.5)

Uma sessão do Claude completa dados pela API da app com o token de um usuário de serviço
"Carga" (nível escrita, papel operador; sem curador, estratégico nem admin). O token mora no
ambiente da sessão, nunca no repositório. Passos:

1. `POST /api/dados/inteligencia_imobiliaria/importacoes/__upload?coluna=arquivo` (multipart,
   um arquivo) → `{ upload_id }`. O `upload_id` vale 10 minutos.
2. `POST /api/inteligencia_imobiliaria/importacoes/previa`
   `{ tabela_alvo, upload_id, modo_duplicata: "ignorar" | "atualizar", padroes? }` → contagens,
   `colunas_ignoradas` e as primeiras 50 rejeições.
3. **Ler a prévia.** Rejeição ou coluna ignorada que a sessão não sabe explicar: parar e voltar ao
   dono, sem aplicar.
4. `POST /api/inteligencia_imobiliaria/importacoes/:id/aplicar`.

Regras: nunca aplicar sem ler a prévia; só `ignorar` ou `atualizar`; a importação aparece na
Operação com o autor "Carga" e o admin pode desfazê-la.

## Para agentes (referência)

| Método | Rota | Papel |
|---|---|---|
| GET | `/importacoes/tabelas` | leitura |
| GET | `/importacoes/modelo/:tabela` | leitura |
| GET | `/importacoes`, `/importacoes/:id` | leitura |
| POST | `/importacoes/previa` | operador |
| POST | `/importacoes/:id/previa` (refaz com outro modo ou `padroes`) | operador |
| POST | `/importacoes/:id/aplicar`, `/importacoes/:id/cancelar` | operador |
| POST | `/importacoes/:id/desfazer` | admin |
| GET | `/qualidade?tabela&codigo&severidade&resolvido=false\|true\|todos` | leitura |
| PATCH | `/qualidade/:id/resolver` | operador |
| POST | `/contornos/importar` `{ upload_id }`, `/contornos/importar/:id/aplicar` `{ indices?, categoria?, localidade_id? }` | curador |
