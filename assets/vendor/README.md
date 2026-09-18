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

## lucide/ — 1.47.0 (só a licença)

Os ícones das âncoras (`src/icons.js`, issue #112) são traços SVG copiados do pacote
npm `lucide-static@1.47.0` (`npm pack lucide-static@1.47.0`, arquivos de `icons/`).
Não há arquivo de runtime aqui: os traços vivem como dados em `src/icons.js`, sem
fonte de ícones nem sprite. A licença ISC exige que o aviso acompanhe a cópia, e é
isso que `lucide/LICENSE` faz.

Para trocar ou acrescentar um ícone: abra `package/icons/<nome>.svg` do pacote, copie
os nós de dentro do `<svg>` para `ANCHOR_ICONS` em `src/icons.js` e mantenha a versão
citada aqui e no cabeçalho do módulo em sincronia.
