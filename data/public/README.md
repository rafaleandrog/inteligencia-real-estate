# data/public/

Arquivos **derivados de fontes públicas oficiais** (IBGE, Ipea, OpenStreetMap, GeoPortal/SEDUH),
gerados pelo pipeline em `pipeline/` e publicados pelo GitHub Pages. O site os lê pelo
`manifest.json` (procedência, hash e orçamento de cada arquivo).

- **Não edite à mão** (`docs/ENGINEERING_RULES.md`, R2.8): o validador roda em toda PR e recusa
  arquivo cujo hash difere do manifest.
- Contrato: `docs/DATA_CONTRACT.md`, seção "Arquivos públicos — data/public/".
- Schemas executáveis em `schemas/`.
- Atualização: PR automática aberta por `.github/workflows/dados-publicos.yml`.

Enquanto o pipeline não roda pela primeira vez, esta pasta tem só este README, os schemas e um
`manifest.json` **vazio** (`datasets: []`, escrito por `python -m imob_pipeline init-manifest`) —
existe para o site nunca pedir um arquivo inexistente. O cliente lê "publicado sem nenhum
conjunto", desliga as camadas territoriais dizendo por quê e segue (R2.5).
