# assets/vendor/

Dependências de runtime versionadas no repositório, em vez de carregadas de CDN.

## Por quê

- O site público não deve depender da disponibilidade de um terceiro.
- Sem CDN não há SRI para manter atualizado a cada bump de versão.
- CI e ambientes de desenvolvimento sem acesso a CDN conseguem rodar o smoke test.
- Continua sem build: são arquivos estáticos servidos pelo GitHub Pages.

Ver `docs/ENGINEERING_RULES.md`, R1.6.

## leaflet/ — 1.9.4

Origem: pacote npm `leaflet@1.9.4` (`npm pack leaflet@1.9.4`), arquivos de `dist/`.
Licença BSD-2-Clause, preservada em `leaflet/LICENSE`.

Para atualizar:

```bash
npm pack leaflet@<versão>
tar xzf leaflet-<versão>.tgz
cp package/dist/leaflet.js package/dist/leaflet.css assets/vendor/leaflet/
cp package/dist/images/*.png assets/vendor/leaflet/images/
cp package/LICENSE assets/vendor/leaflet/
```

Atualize a versão citada aqui no mesmo commit.
