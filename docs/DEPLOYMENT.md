# Deploy no GitHub Pages

## 1. Configure a planilha

Siga [`SHEET_SETUP.md`](SHEET_SETUP.md) e confirme que `src/config.js` tem o ID correto e
`dataSource: 'gviz'`.

A planilha **precisa estar compartilhada para leitura pública** — o navegador do visitante a
consulta diretamente. Se não estiver, a aplicação mostra o estado de erro com "Tentar novamente"
em vez de tela branca, mas não carrega dado nenhum.

Para publicar sem a planilha ligada, use `demoMode: true`: a interface passa a exibir o selo
laranja **Modo demonstração**, para que ninguém confunda o dataset de exemplo com produção.

## 2. Estrutura do repositório

```text
index.html                 página única da aplicação
assets/
  styles.css               visual
  vendor/leaflet/          Leaflet 1.9.4 versionado (sem CDN)
src/
  config.js                ID da planilha e origem dos dados
  data.js                  estratégias de carregamento
  normalize.js             conversão e normalização
  filters.js               filtros, mediana, KPIs
  format.js                formatação e saneamento
  app.js                   interação e mapa
data/demo.json             dataset de demonstração
tests/                     suíte de testes (node --test)
tools/                     migração, geração do demo, smoke test
migration/                 semente .xlsx de importação
reference/index-v3.html    referência funcional do modelo anterior
optional-apps-script/      camada de governança na planilha
docs/                      documentação
.nojekyll                  impede o processamento Jekyll no Pages
```

## 3. Trabalho no repositório

O repositório já existe. Trabalhe em branch e abra PR — **toda PR passa por review do
Codex antes do merge** (`docs/AI_WORKFLOW.md`).

```bash
git checkout -b minha-mudanca
npm test                     # antes de commitar
git push -u origin minha-mudanca
```

Não há etapa de build: o que está no repositório é o que o GitHub Pages serve.

## Versão dos assets

`index.html` e `admin.html` têm dois blocos **gerados** — as folhas de estilo com `?v=`, o
import map dos módulos, e os scripts. Quem os escreve é `npm run versionar`, e o resultado é
commitado como qualquer outro arquivo.

Rode-o **sempre que mexer em `src/` ou em `assets/`**. Esquecer não passa despercebido:
`tests/asset-version.test.js` recalcula o hash e falha, nomeando a página defasada — e a CI
roda `npm test`.

Isso existe porque as peças da página têm cache independente. Sem a versão, um navegador que
já abriu o site pode montar a tela com HTML novo e módulo velho depois de um deploy, que é
uma combinação que nunca existiu em teste (R8.78). E a query só na entrada não bastaria: as
importações dentro de `app.js` não a herdam — daí o import map.

## 4. Ative GitHub Pages

No repositório:

1. `Settings`.
2. `Pages`.
3. `Build and deployment`.
4. `Source`: `Deploy from a branch`.
5. Branch: `main`.
6. Folder: `/ (root)`.
7. Salve.

## 5. Regra de atualização

- Mudou código/interface: commit + push no GitHub.
- Mudou dados: edite somente a Google Sheet.
- Mudou o schema: atualize planilha + `DATA_CONTRACT.md` + código no mesmo PR.

Não faça export manual de JSON da planilha para o repositório em produção.
