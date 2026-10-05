# Atalhos. Tudo roda com `python -m imob_pipeline` a partir desta pasta (PYTHONPATH=pipeline na raiz).
PY ?= python3
OUT ?= ../data/public

.PHONY: test validate run-crosswalk run-all pr-body

test:
	$(PY) -m unittest discover -s tests -t . -v

validate:
	$(PY) -m imob_pipeline validate $(OUT) --config config/df.toml

run-crosswalk:
	$(PY) -m imob_pipeline run ra_crosswalk --out $(OUT) --config config/df.toml

run-all:
	$(PY) -m imob_pipeline run all --out $(OUT) --config config/df.toml

pr-body:
	$(PY) -m imob_pipeline pr-body --out $(OUT) --to .cache/runs/latest/pr_body.md --summary .cache/runs/latest/summary.json
