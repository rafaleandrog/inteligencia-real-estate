---
name: imob-pipeline
description: Acionar para qualquer mudança no pipeline de dados públicos (pipeline/), nos arquivos de data/public/, no manifest ou nos schemas — e quando o site passar a ler um arquivo público novo.
---

# imob-pipeline

`data/public/` é dado **derivado de fonte pública oficial**, gerado por `pipeline/` e lido pelo
site pelo `manifest.json` (R2.7–R2.9 em `docs/ENGINEERING_RULES.md`; contrato em
`docs/DATA_CONTRACT.md`, "Arquivos públicos — data/public/").

## Regras que não se negociam

- **Nada em `data/public/` é editado à mão** (R2.8). Mudou o dado, muda no pipeline e regera.
- **Toda mudança de contrato anda junta**: `docs/DATA_CONTRACT.md` → `data/public/schemas/*.json`
  → `pipeline/` (transformação + validador) → `src/territorio/*` (normalizador e registro) →
  fixtures `tests/fixtures/public/` (regeradas com hash novo) → testes dos dois lados → bump de
  `MANIFEST_SCHEMA_VERSION` (`src/territorio/manifest.js`) quando o formato do manifest muda.
- **Ausência é `null`, nunca `0`**; dado suprimido vira `null` + flag, nunca é saturado (R8.59).
- **Chave de RA é `RA_nn`**; a tradução para `RA2026_RA-<romano>` só pela ponte publicada
  (`ra_crosswalk.json`). Nunca por nome, nunca por aritmética de romanos no cliente (R2.9).
- **Credencial de nuvem só como secret**; o job que a usa nunca é o job que commita (R4.10).

## Workflow

1. Mudança no pipeline → `cd pipeline && python3 -m unittest discover -s tests -t .` (geo pula
   com motivo onde a stack não existe; a CI `pipeline-tests.yml` roda a suíte inteira).
2. `python -m imob_pipeline run all --out <tmp> --config config/fixture.toml --fixture-dir tests/fixtures`
   e `validate <tmp> --config config/fixture.toml` — ponta a ponta sem rede.
3. Mudou o formato de saída → atualizar contrato, schemas, `src/territorio/*`, fixtures e testes
   na MESMA PR; `npm test` e `npm run versionar`.
4. Smoke do site com `APP_CONFIG.publicDataUrl = './tests/fixtures/public/'` (ver
   `tools/smoke-test.mjs`, seção Território).
5. Primeira execução real de um dataset novo: `workflow_dispatch` de `dados-publicos.yml` com
   `datasets: <id>`; ler `summary.json` e os logs (artefato `logs-pipeline`); conferir tamanhos
   contra os orçamentos; pinar o que a descoberta encontrou (`quadrant_ids`, nomes de arquivo).

## Checklist antes de declarar pronto

- [ ] Validador recusa cada defeito que a mudança podia introduzir (teste plantado, R8.23)
- [ ] `manifest.json` lista todo arquivo com `bytes`, `sha256`, `features`, `budget_bytes`
- [ ] Procedência completa: `sources[].url`, `retrieved_at`, `license`, `attribution_pt`
- [ ] Mesma entrada → mesmos bytes (determinismo); mês sem mudança não abre PR
- [ ] Contrato, schemas, normalizador e fixtures em sincronia
