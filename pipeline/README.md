# pipeline/ — dados públicos para `data/public/`

Gera, a partir de fontes oficiais, os arquivos que o site lê do próprio GitHub Pages
(`docs/ENGINEERING_RULES.md`, R2.7–R2.9). Roda no GitHub Actions (`.github/workflows/dados-publicos.yml`)
ou na máquina de quem opera. **Nunca no navegador.** O contrato dos arquivos está em
`docs/DATA_CONTRACT.md` ("Arquivos públicos — data/public/").

## Rodar

```bash
cd pipeline
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt            # stack geoespacial completa (Actions / máquina própria)
python -m imob_pipeline run ra_crosswalk --out ../data/public --config config/df.toml
python -m imob_pipeline run all --out ../data/public
python -m imob_pipeline validate ../data/public --config config/df.toml
python -m imob_pipeline init-manifest          # só antes da 1ª execução real: manifest vazio (datasets: [])
```

Sem a stack geoespacial o núcleo continua funcionando (`ra_crosswalk`, validador, manifest) e a
suíte inteira roda só com a biblioteca padrão: os testes usam os motores puros (`use_shapely=False`,
`engine="pure"`). Shapely/STRtree e igraph entram na execução real (`--engine auto`) e são
instalados e importados na CI `pipeline-tests.yml` — é lá que os pinos de versão se provam.

- `--fixture-dir DIR`: usa `DIR/fixture_urls.json` (URL → arquivo local) e **nunca** toca a rede.
- `--refresh`: ignora o cache de downloads (`pipeline/.cache/raw`, gitignored; ETag/If-Modified-Since nas reexecuções).
- Logs e `summary.json` ficam em `pipeline/.cache/runs/<timestamp>/` (`latest` aponta para o último).

## Fixtures do site

`tests/fixtures/public/` é a saída do pipeline em modo fixture, lida pelos testes Node e pelo
smoke (`APP_CONFIG.publicDataUrl = './tests/fixtures/public/'`). Regenere sempre que um dataset,
um schema ou o manifest mudar — nunca edite à mão (R2.8):

```bash
PYTHONPATH=pipeline python -m imob_pipeline run all --fixture-dir pipeline/tests/fixtures \
  --config pipeline/config/fixture.toml --out tests/fixtures/public --cache /tmp/imob-cache --engine pure
```

## O que é commitado

`imob_pipeline/`, `config/`, `tests/`, `requirements*.txt`, `pyproject.toml`. **Nunca** `.cache/`,
`.venv/` nem dado bruto. A saída (`data/public/`) só entra em `main` pela PR automática.

## Primeira execução real (depois do merge)

1. Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
2. `workflow_dispatch` de `dados-publicos.yml` com `datasets: ra_crosswalk` → conferir a PR.
3. `datasets: all`. Com `households_grid.quadrant_ids` vazio, o pipeline resolve os quadrantes da
   Grade sozinho (lista o diretório do IBGE, baixa cada `grade_id*.zip`, lê só os limites e mantém
   os que cruzam o bbox do projeto, por edição); os ids escolhidos ficam no log, no `summary.json`
   (`quadrant_ids_2010`/`_2022`, `quadrant_discovery`) e nas notas do manifest. Um conjunto que
   falha não derruba os seguintes: o erro vai para o `summary.json` e a execução termina com 1
   sem publicar nada, para todas as falhas aparecerem numa execução só.
4. Pinar em `pipeline/config/df.toml` os quadrantes que a descoberta escolheu (para não baixar a
   Grade inteira de novo) e confirmar o `metadata.csv` do AOP (candidatas em `metadata_fallback_urls`; sem
   resposta, o log lista os links de dados das páginas em `probe_urls`); ler `summary.json` e os logs
   (tamanhos, tempos, contagens); ajustar orçamentos e percentis. `discover grade` só lista os
   nomes dos arquivos.

Sem a permissão "Allow GitHub Actions to create and approve pull requests" (issue #155) a
criação da PR falha, mas a branch `dados-publicos/atualizacao` é enviada com `data/public/`
regenerado e validado: abra a PR à mão a partir dela (base `main`, labels `type:chore` e
`dados-publicos`), com o corpo que o workflow deixa no artefato `corpo-da-pr`. O disparo do
workflow em si (`workflow_dispatch`) pode ser feito pela API do GitHub ou pelo Claude Code.
