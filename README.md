# Imob Intelligence

Aplicação pública de inteligência do mercado imobiliário do Distrito Federal.

- **GitHub Pages** hospeda todo o front-end.
- **Google Sheets** é a fonte de verdade dos dados curados.
- **Google Visualization Query** lê as abas da planilha direto no navegador.
- **`data/public/`** guarda o dado derivado de fonte pública oficial (IBGE, Ipea, OpenStreetMap,
  GeoPortal), gerado por `pipeline/` e lido na mesma origem do Pages.
- **Leaflet** desenha o mapa.

A referência funcional do modelo anterior está preservada em
[`reference/index-v3.html`](reference/index-v3.html).

## Arquitetura em uma frase

```
Google Sheets (dado curado) ─┐
                             ├→ navegador no GitHub Pages
data/public/ (dado público) ─┘   ↑ pipeline/ (Python, GitHub Actions) → PR automática
```

Não há etapa de exportar dados da planilha para o GitHub e não há backend intermediário
obrigatório na V1. Isso elimina a principal fonte de dessincronização do MVP. O que o site lê
além da planilha é **dado derivado de fonte pública oficial** (IBGE, Ipea, OpenStreetMap,
GeoPortal), gerado por `pipeline/` com manifest de procedência e publicado em `data/public/`
por PR automática (R2.7–R2.9).

## Está trabalhando neste repositório?

**Se você é um agente de IA, comece por [`AGENTS.md`](AGENTS.md).**

| Documento | Para quê |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Porta de entrada para agentes + regras de code review |
| [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) | Regras de engenharia — fonte canônica |
| [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md) | Skills, debugging, smoke test, ciclo de review do Codex |
| [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) | Escopo da V1 e fases seguintes |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Decisões de arquitetura |
| [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) | Schema — fonte de verdade dos dados |
| [`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md) | Configurar a Google Sheet |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Publicar no GitHub Pages |
| [`pipeline/README.md`](pipeline/README.md) | Pipeline de dados públicos → `data/public/` |
| [`warehouse/README.md`](warehouse/README.md) | Modelo 2 — base histórica multi‑cidade (planejado) |

## Comece por aqui

1. Leia [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md).
2. Crie uma Google Sheet seguindo [`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md) — importe
   [`migration/imob-intelligence-backend.xlsx`](migration/), que já traz todas as abas e cabeçalhos.
3. Cole o ID da planilha em `src/config.js`.
4. Habilite GitHub Pages conforme [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Desenvolvimento local

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Testes

```bash
npm test           # runner nativo do Node, sem framework, sem dependências
```

Smoke test em navegador (roteiro completo, exige `npm install` do playwright):

```bash
npm run serve &
npm run smoke        # site público
npm run smoke:admin  # área administrativa (issue #5) — Apps Script mockado via page.route()
```

As seções territoriais do smoke apontam `APP_CONFIG.publicDataUrl` para `tests/fixtures/public/`
(a saída do pipeline em modo fixture), então não dependem de `data/public/` ter dado real. O
pipeline tem suíte própria, em Python, que roda só com a biblioteca padrão:

```bash
cd pipeline && python3 -m unittest discover -s tests -t .
```

## Regra anti-dessincronização

**Código mora no GitHub. Dados moram na Google Sheet.**

- Mudou código ou interface → commit e push.
- Mudou dado → edite somente a Google Sheet, sem commit.
- Mudou schema → planilha + [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) + código, na mesma PR.

Não faça export manual de JSON da planilha para o repositório no fluxo normal.

## Migração do modelo antigo

```bash
node tools/reference-to-csv.mjs reference/index-v3.html migration-csv
```

O comando extrai o dataset embutido no HTML de referência e gera CSVs para importar na planilha.
Alternativa mais direta: importe o `.xlsx` de [`migration/`](migration/), que já está no formato final.

## Quando usar o Apps Script

`optional-apps-script/Code.gs` é a camada de **operação, automação, validação e governança** dos
dados: setup da planilha, validação, `DATA_QUALITY`, `APP_META`, `CHANGE_LOG`, versionamento de
dataset e gatilhos.

Ele **não** substitui a leitura direta da planilha pelo site enquanto o GViz for simples e
confiável — leitura (`doGet`) continua pública e sem autenticação. Ver
[`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md).

## Área administrativa

`admin.html` permite listar (com busca, ordenação por coluna e paginação, mostrando todos os
campos de cada aba — não só os usados no mapa), criar, editar e excluir registros de `LISTINGS`,
`DEVELOPMENTS` e `ANCHORS`, com a mudança persistida na Google Sheet.

Login por token direto (`ADMIN_TOKEN`, configurado em Script Properties), reenviado em toda
requisição — mesmo modelo do `press-research-communications` no repo `tipolis-sandbox`. O token
fica só em `sessionStorage` do navegador; rotacionar `ADMIN_TOKEN` invalida o acesso na próxima
chamada, sem sessão para expirar por fora. Sem `ADMIN_TOKEN` configurado, `doPost` recusa toda
gravação (`docs/ENGINEERING_RULES.md`, R4.9). Ver [`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md) §8
para habilitar.

## Camadas territoriais (dados públicos)

O painel de camadas do Mapa tem o bloco **Território (dados públicos)**, com três camadas de
fonte oficial lidas de `data/public/` pelo `manifest.json`:

| Camada | Fonte | O que o mapa desenha |
|---|---|---|
| Domicílios 2010→2022 | IBGE — Grade Estatística dos Censos 2010 e 2022 | células pintadas por classe; padrão: domicílios novos por km² (o valor absoluto só no detalhe) |
| Empregos formais | Ipea — Acesso a Oportunidades (RAIS) | hexágonos H3 pintados por classe; total ou por faixa de renda |
| Centralidade viária | OpenStreetMap (ODbL) | vias em linha, mais grossas e escuras quanto maior o percentil de centralidade |

Domicílios e empregos são coroplética em canvas, uma por vez; a centralidade convive com
qualquer uma delas. Cada camada tem **legenda** (classes fixas do manifest e "sem dado"),
**detalhe** ao clicar na célula, no hexágono ou na via (essencial, complementar e técnico) e uma
linha de **procedência** que leva à **Base de dados**, onde cada conjunto aparece com versão,
arquivos, fontes (link e data de coleta), licença, método e cortes de classe. O mapa abre com
domicílios e vias ligados; o estado entra no link: `#mapa?terr=jobs_hex` troca a área,
`#mapa?terr=0&vias=0` desliga tudo.

Os agregados por RA (`ra_aggregates.json`) são cruzados com o PDAD pela ponte declarada entre as
duas grafias de RA (`ra_crosswalk.json`, R2.9), nunca por nome: crescimento de domicílios,
empregos formais por mil moradores e por km² e centralidade viária média entram no Ranking (cada
cartão com fórmula e fonte), em duas leituras da dispersão, em colunas do Comparar, no bloco
**Perfil territorial** do Diagnóstico (valor, diferença contra a mediana das RAs com dado e
posição) e no bloco da RA do Mapa, sempre com fonte e ano. Sem os arquivos públicos ou sem a ponte,
tudo isso fica ausente — nunca zero, nunca um cruzamento adivinhado.

### Pipeline: `pipeline/` → `data/public/`

`pipeline/` (Python) lê as fontes oficiais e escreve `data/public/` — ponte de RAs, os três
conjuntos e os agregados por RA —, com manifest de procedência, `sha256` e orçamento de tamanho
de cada arquivo. Roda no GitHub Actions (`.github/workflows/dados-publicos.yml`, mensal e manual)
ou na máquina de quem opera, nunca no navegador, e só entra em `main` pela PR automática, que o
validador confere em toda PR (R2.7–R2.9). Nada em `data/public/` se edita à mão. Comandos,
fixtures e o passo a passo estão em [`pipeline/README.md`](pipeline/README.md).

`data/public/` tem hoje só o README, os schemas e um manifest vazio. **A primeira execução real
acontece pela PR automática do workflow `dados-publicos.yml` depois do merge.** Até lá as camadas
territoriais ficam desabilitadas no Mapa, cada uma com o motivo, e o resto do site funciona
igual (R2.5).

## Estado atual

Três views em produção — Mapa, Mercado Residencial DF e Diagnóstico Territorial PDAD-A (com
Ranking, Comparar e Base de dados) — alimentadas pela Google Sheet via GViz. Fases Explorar,
Entender e Comparar entregues; ver [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md).

Fase 3b (issue #146), no código: as três camadas territoriais do Mapa — domicílios 2010→2022
(IBGE), empregos formais (Ipea/RAIS) e centralidade viária (OpenStreetMap) —, com legenda,
detalhe e procedência; a seção "Arquivos públicos" da Base de dados, que lista as fontes; a ponte
declarada entre as grafias de RA; e os agregados por RA cruzados com o PDAD. Pendentes: a
primeira execução real do pipeline — até lá `data/public/` não tem nenhum conjunto e as camadas
ficam desabilitadas, com o motivo — e o Modelo 2 (`warehouse/`, issue #154), só desenhado.

O Apps Script v2.6.0 (`optional-apps-script/Code.gs`) é a camada de governança da planilha:
validação, saneamento (dinheiro como número, período FipeZap como texto), filas de cobertura,
metadados e a **verificação diária dos anúncios nos portais** (issue #178). Gatilho às 05h. Bloqueio do
portal nunca inativa; um anúncio vira inativo com 3 confirmações de remoção em dias distintos e é
reativado quando volta. Cada execução fica em `LISTINGS_UPDATE_RUNS` e o mês fecha em
`LISTINGS_MONTHLY_METRICS`. A **busca de anúncios novos** (issue #179, 06h) lê as buscas salvas
em `LISTING_SEARCHES` (uma URL de resultados por linha, copiada do portal), gera candidatos, lê a
página de cada um e promove a `LISTINGS` o que passa nos portões. A coordenada é aproximada e
declarada. Editar uma busca ou aprovar um candidato dispara a rotina. O runbook de instalação e
sincronização está em [`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md) §9, §10 e §11. Contagens de registros vivem em `APP_META`, não
neste README — qualquer número escrito aqui envelheceria no dia seguinte.
