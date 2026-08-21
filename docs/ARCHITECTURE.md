# Arquitetura

## MVP recomendado

```text
Editor de dados
   |
   v
Google Sheets  <-- fonte de verdade
   |
   | Google Visualization Query
   v
GitHub Pages (HTML/CSS/JS)
   |
   v
Navegador + Leaflet
```

## Separação de responsabilidades

Uma linguagem por arquivo, uma responsabilidade por módulo.

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Estrutura. Sem estilo inline, sem lógica |
| `assets/styles.css` | Visual |
| `src/config.js` | ID da planilha, origem dos dados, nomes das abas |
| `src/data.js` | Carregamento e escolha da estratégia |
| `src/normalize.js` | Conversão e normalização — **funções puras** |
| `src/filters.js` | Filtros, mediana, KPIs — **funções puras** |
| `src/format.js` | Formatação e saneamento — **funções puras** |
| `src/app.js` | Interação, mapa e DOM |
| Google Sheet | Registros e governança |

A divisão não é estética: as três camadas de funções puras são as que a suíte cobre sem
navegador e sem rede. `app.js` concentra o que só dá para verificar por smoke test.

## Estratégias de dados

`src/data.js` mantém um registro de estratégias com a mesma assinatura, para que trocar a origem
seja mudança de configuração e não reescrita:

| Estratégia | Uso |
|---|---|
| `gviz` | Google Visualization Query direto na planilha — **caminho principal** |
| `demo` | `data/demo.json` — demonstração e desenvolvimento offline |
| `appsscript` | Web App do Apps Script — alternativa |

O GViz é carregado por **JSONP** (`tqx=responseHandler`), não por `fetch`: o endpoint
público não envia `Access-Control-Allow-Origin` e o navegador bloquearia a resposta no
GitHub Pages mesmo com a planilha compartilhada para leitura.

As três abas obrigatórias são buscadas em paralelo com `Promise.allSettled`: uma aba com
problema não descarta as outras duas que chegaram bem.

O Apps Script **não** substitui o GViz enquanto a leitura direta for simples e confiável.

## Dependências de runtime

Leaflet é a única, e fica **versionada em `assets/vendor/`** em vez de vir de CDN: um site público
não deve depender da disponibilidade de terceiro, não há SRI para manter, e ambientes sem acesso a
CDN conseguem rodar o smoke test.

## Regra anti-dessincronização

**Não commitar snapshots de dados para produção.** O navegador consulta a planilha quando a aplicação abre. O GitHub guarda código; a Google Sheet guarda dados.

## Limite de segurança

A planilha usada pela V1 precisa ser própria para dados públicos. Não coloque nela informações privadas, chaves ou dados pessoais sensíveis.

## Backend opcional

`optional-apps-script/Code.gs` é a rota adotada para writes autenticados (issue #5, `doPost` sob token — R4.9) e para regras privadas. Fora da escrita administrativa, é uma rota futura: só adote mais responsabilidade quando houver necessidade concreta, pois introduz uma segunda superfície de deploy.

## Quando migrar para banco dedicado

- muitos milhares de pontos por abertura;
- filtros geoespaciais no servidor;
- autenticação por usuário;
- writes concorrentes;
- histórico temporal volumoso;
- ingestão automática frequente.
