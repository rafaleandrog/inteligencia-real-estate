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

- `index.html`: estrutura.
- `assets/styles.css`: visual.
- `src/app.js`: interação, filtros e mapa.
- `src/data.js`: conexão com a Google Sheet.
- `src/config.js`: ID da planilha e nomes das abas.
- Google Sheet: registros e governança de dados.

## Regra anti-dessincronização

**Não commitar snapshots de dados para produção.** O navegador consulta a planilha quando a aplicação abre. O GitHub guarda código; a Google Sheet guarda dados.

## Limite de segurança

A planilha usada pela V1 precisa ser própria para dados públicos. Não coloque nela informações privadas, chaves ou dados pessoais sensíveis.

## Backend opcional

`optional-apps-script/Code.gs` é uma rota futura para writes, autenticação ou regras privadas. Só adote quando houver uma necessidade concreta, pois introduz uma segunda superfície de deploy.

## Quando migrar para banco dedicado

- muitos milhares de pontos por abertura;
- filtros geoespaciais no servidor;
- autenticação por usuário;
- writes concorrentes;
- histórico temporal volumoso;
- ingestão automática frequente.
