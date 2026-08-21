# Imob Intelligence

Aplicação pública de inteligência do mercado imobiliário do Distrito Federal.

- **GitHub Pages** hospeda todo o front-end.
- **Google Sheets** é a fonte de verdade dos dados.
- **Google Visualization Query** lê as abas da planilha direto no navegador.
- **Leaflet** desenha o mapa.

A referência funcional do modelo anterior está preservada em
[`reference/index-v3.html`](reference/index-v3.html).

## Arquitetura em uma frase

```
Google Sheets → navegador no GitHub Pages
```

Não há etapa de exportar dados da planilha para o GitHub e não há backend intermediário
obrigatório na V1. Isso elimina a principal fonte de dessincronização do MVP.

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

`admin.html` permite criar, editar e excluir registros de `LISTINGS`, `DEVELOPMENTS` e `ANCHORS`
diretamente pela interface, com a mudança persistida na Google Sheet. Escrita exige um token
(`ADMIN_TOKEN`, configurado em Script Properties) — sem ele, `doPost` recusa toda gravação
(`docs/ENGINEERING_RULES.md`, R4.9). Ver [`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md) §8 para
habilitar.

## Estado atual

Em construção — V1 sendo implementada por etapas. Ver
[`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) para o escopo e as fases.
