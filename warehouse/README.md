# warehouse/ — Modelo 2: base histórica multi‑cidade (esqueleto)

**Status: planejado; implementação adiada** (issue #154). Guarda o desenho para a próxima
rodada: painel histórico de São Paulo, Florianópolis, Goiânia e Brasília (referência) para
entender como população, renda, empregos, mobilidade, área construída e preço evoluem juntos,
e produzir cenários 5–10 anos **com incerteza declarada**.

## Desenho

- Painel **longo** canônico `city_id × year × variable_id × source_id` (fonte, safra, flag de
  qualidade, `n` e nota de método por número); tabelas largas são views DuckDB.
- Diretórios: `config/` (cidades, fontes, variáveis), `raw/` e `staging/` (gitignored), `marts/`
  (parquet pequeno, commitado, ≤ 10 MB no total, só licença pública — o GitHub Pages publica o
  repositório inteiro), `sql/`, `notebooks/` (saídas limpas), testes.
- Código Python como pacote `warehouse` em `pipeline/`, reutilizando `Fetcher` e o conector
  BigQuery; CLI `python -m warehouse {ingest|build|check|publish|backtest}`; workflow mensal
  próprio com PR de dados.
- Rasters pesados (GHSL, luzes noturnas, Grade IBGE) rodam na máquina do dono e entram só como
  parquet derivado com procedência; a CI roda HTTP + BigQuery.
- Dinheiro nominal armazenado, exposto deflacionado (IPCA, base 2024); percentuais em fração
  decimal.
- **Previsão só publica com backtest** (método, janela, MAPE e cobertura do intervalo ao lado de
  cada número); modelo que não bate o ingênuo não é publicado.

## Fontes previstas

SIDRA (t6579, t202/t4714/t4712, t5938, t1737), Projeções IBGE 2024, BigQuery/Base dos Dados
(`br_me_rais`, `br_me_caged`, `br_me_cnpj`, `br_denatran_frota`, `br_ibge_pib/populacao`),
FipeZap (séries históricas), Atlas Brasil (IDHM/UDH), MapBiomas col. 9, IBGE Áreas Urbanizadas,
GHSL R2023A, luzes noturnas, Grade Estatística 2010/2022, Ipea AOP (SP, Goiânia, Brasília —
não cobre Florianópolis), Ipeadata, aba curada `CIDADES_CURATED` na planilha.

## Primeiro marco (F1)

`pop_total` ponta a ponta nas 4 cidades: Censos 1991/2000/2010/2022 observados + estimativas
anuais; 2023 nulo renderizado como "sem estimativa oficial"; `data/public/cidades/city_panel.json`
+ aba "Cidades" mínima no site.
