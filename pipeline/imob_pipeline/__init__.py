"""Pipeline de dados públicos do Imob Intelligence (DF).

Gera os arquivos de `data/public/` a partir de fontes oficiais (IBGE, Ipea, OpenStreetMap,
GeoPortal/SEDUH), com manifest de procedência e hash. Roda só no GitHub Actions ou na
máquina de quem opera — nunca no navegador (docs/ENGINEERING_RULES.md, R2.7).
"""

__version__ = "0.1.0"
