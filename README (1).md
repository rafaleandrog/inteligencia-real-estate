# Imob Intelligence

MVP público de inteligência do mercado imobiliário com:

- **GitHub Pages** para hospedar todo o front-end.
- **Google Sheets** como fonte de verdade dos dados.
- **Google Visualization Query** para ler diretamente as abas da planilha no navegador.
- **Leaflet** para o mapa.

A referência funcional anterior está preservada em `reference/index-v3.html`.

## Arquitetura em uma frase

`Google Sheets -> navegador no GitHub Pages`

Não há etapa de exportar dados da planilha para o GitHub e não há backend intermediário obrigatório na V1. Isso elimina a principal fonte de dessincronização do MVP.

## Comece por aqui

1. Leia `docs/PRODUCT_PLAN.md`.
2. Crie uma Google Sheet e siga `docs/SHEET_SETUP.md`.
3. Cole o ID da planilha em `src/config.js` e altere `demoMode` para `false`.
4. Suba este conteúdo para um repositório GitHub e habilite GitHub Pages conforme `docs/DEPLOYMENT.md`.

## Desenvolvimento local

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Migração do modelo antigo

```bash
node tools/reference-to-csv.mjs reference/index-v3.html migration-csv
```

O comando extrai o objeto de dados embutido no HTML de referência e gera CSVs para importar na planilha.

## Quando usar o Apps Script opcional

Somente quando você precisar de escrita pelo site, autenticação, lógica privada ou uma API controlada. Um exemplo inicial fica em `optional-apps-script/Code.gs`, mas ele não é necessário para a V1 pública de leitura.
