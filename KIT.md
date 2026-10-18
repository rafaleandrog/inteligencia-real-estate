# KIT.md — regras deste repositório

Kit `100.3.16` · SDK 100 · `@urbiverso/sdk` `100.0.0` · shell `0.56.37` · `urbiverso/urbiverso@a17d0267`

## O kit, e como instalar ou atualizar

Instalar e atualizar: mesmo comando, na raiz:

    npx @urbiverso/kit-apps

A preparação de sessão avisou `kit X instalado, Y publicado`? É **ordem**: na primeira resposta, avise o usuário, rode o comando acima e commite só isso — sem esperar pergunta.

Dono deste arquivo, de `.claude/preparar-sessao.sh`, de `.github/{workflows/{release,ci}.yml,kit/}` e das pastas `.claude/skills/{especificar,implementar,instancia-urbiverso,orquestrar,qa,revisar-pr-apps,roteador-urbiverso}/`: reescreve tudo isso a cada atualização, e **o que você editar neles some sem aviso** — é quebra de contrato, não customização. O resto é seu, `apps/` e `modulos/` inclusive, onde ele nunca escreve; em `.claude/notificacoes-urbiverso/`, só cria o README que falta.

`401`/`403`/`404` no `npx` ou no `pnpm install` é credencial, nunca pacote sumido. `401` não autenticou: token ausente, vencido, ou fine-grained — o registro só aceita PAT **classic**. `403` autenticou e não alcança o pacote: falta `read:packages`, ou o convite de acesso não foi aceito. O `.npmrc` tem que apontar `@urbiverso` para `https://npm.pkg.github.com`. O kit o versiona; sem ele ainda, escreva:

    @urbiverso:registry=https://npm.pkg.github.com
    //npm.pkg.github.com/:_authToken=${URBIVERSO_PACKAGES_TOKEN}

**`URBIVERSO_PACKAGES_TOKEN` mora em dois lugares, e um não cobre o outro.** No **ambiente** (variável), para o `pnpm install` daqui. E nos **secrets do repositório** (Settings → Secrets and variables → Actions), com o mesmo nome, para `release.yml` e `ci.yml` — que rodam no GitHub e não enxergam o seu ambiente. Só a variável: o trabalho anda e o release quebra, no dia em que alguém publicar. O aviso amarelo do pnpm dizendo que ignorou a credencial do `.npmrc` do projeto é barulho — sem aquela linha, é `401`.

`apps/ola_mundo/` só vem em repositório sem `apps/` nem `modulos/`. Se está aqui, não o vire o app de verdade — o seu nasce ao lado. Ver `apps/ola_mundo/docs/README.md`.

## Referência

Este repositório tem **apps** e/ou **módulos**; a plataforma (**shell**) não está aqui. O que eles enxergam dela é o contrato publicado em `@urbiverso/sdk`.

- Sem `node_modules`: `pnpm install` na raiz.
- No início da sessão, leia em `apps/<appId>/node_modules/@urbiverso/sdk/docs/`: `README.md` e `apps-em-repo-proprio.md`. Módulo: em `modulos/<slug>/backend/node_modules/@urbiverso/sdk/docs/`, `README.md` e `modulos-autoria.md`.
- Antes de usar um recurso, leia o doc dele ali: `banco-de-dados`, `barramento`, `permissoes`, `ui`, `ui-componentes-*`, `ia`, `email`, `rotinas`, `config-app`, `paginas-publicas`, `wh`.
- **Fora do pacote não existe.** Não peça o código da plataforma; não invente helper nem rota do shell. Alcançou o `urbiverso/urbiverso`, ignore: piso, `req.*` e manifesto se decidem pelo SDK do lockfile.
- `obsolescencias.json`: o que sai de linha. `docs/compatibilidade.md`: a política.

## Contratos

- App em `apps/<appId>/`. appId = pasta = schema = prefixo `/api/<appId>/` = tag `app-<app-id>`, em `snake_case`.
- Rotas do backend são relativas; o shell monta o prefixo.
- Frontend: `urbiVerso.api('/rota')`. Nunca `fetch` cru em rota autenticada.
- `urbi-*` já registrados. De `@urbiverso/sdk` importe só `type`; nunca valor de `@urbiverso/ui`.
- Não altere as flags de esbuild do `package.json` da app.
- Permissão só por `req.contexto.nivelApp` e `rolesApp`. Nunca por tipo ou natureza de usuário.
- Banco só por `req.dados` e `schema.json`. Sem SQL cru.
- Seed idempotente em `aoIniciar`. Nunca em migração.
- `sdk_min` = major do SDK instalado. `shell_min` = `urbiverso.shell` do `package.json` dele. Copie; não chute. Piso acima do que a instância roda não instala em lugar nenhum.
- `versao` do manifesto sobe quando `schema.json`, migração ou pisos mudam.
- Dependência compartilhada só no catálogo; a app usa `catalog:`. Subir o `@urbiverso/sdk` sobe o piso que a app exige.
- `docs/` da app aparece na instância; muda no mesmo commit do comportamento.
- `pnpm-lock.yaml` é versionado. Sem ele, o release falha no `--frozen-lockfile`.

## Ciclo

- `pnpm install` · `pnpm -r build`, e o empacotador, que roda as checagens do instalador: app, `pnpm -r empacotar`; módulo, `pnpm --dir modulos/<slug>/backend exec urbi-empacotar <slug> --dir ..`. O `-r` pula módulo calado (sem script, sai 0). Rode antes de cada commit; não commite reprovando. `422` na instalação lista `[check] detalhe` — reproduza aqui.
- Release: Actions → `release.yml` → Run workflow com o alvo (appId ou slug); tag, só por ele.
- Merge e release só por ordem expressa na conversa, com PR ou alvo. Ambígua, pergunte; clara, faça.

## Módulos

- Módulo em `modulos/<slug>/`; o pacote do workspace é o `backend/`. slug = pasta = schema, em `snake_case`.
- `identidade`: `{owner}/{repo}::{slug}`, permanente.
- `sdk_min` ≥ o maior entre 96, 98 (com `frontend` ou `requer_extensoes`) e o piso do vocabulário do `schema.json`.
- Evolução só aditiva: versão nova não tira entidade, flag nem coluna exposta de que alguém dependa. O `schema.json` é reconciliado a cada boot e o que ele deixa de pedir é podado — coluna com dado pede migração que a esvazie.
- Pacote `<slug>-<versao>.urbimod.tgz`, forma fechada: `manifesto.json`, `schema.json`, `backend/modulo.js`; `migracoes/`, `docs/` e `frontend/` opcionais. Nunca `backend/package.json` nem `.ts`. Confira pelo empacotador (§ Ciclo).
- Tag `<slug>-m<versao>_<sha8>`; instala em Admin › Instaláveis › Módulos.

## Banco de teste

Teste que precisa de PostgreSQL lê a URL de `URBIVERSO_PG_TESTE_URL` e pula sem ela — salvo com `URBIVERSO_PG_TESTE_EXIGIR=1`, quando falha. Com `requer_extensoes: ["postgis"]` no manifesto, sobem PostGIS e definem as duas: `ci.yml` por qualquer módulo; `release.yml`, só pelo alvo.

## Interlocutor

Provavelmente não é desenvolvedor. Direto ao ponto, um passo por vez; explique o termo na primeira vez e ofereça aprofundar em vez de despejar. Nunca invente valor: pergunte.
