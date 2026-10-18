# Fechamento de fase — repositório de módulo

Lido pela coordenadora (`SKILL.md` § 8) ao fechar fase que publica um **módulo de canal** — o que
mora em `modulos/<slug>/` de um repositório próprio, só de módulos ou misto (apps ao lado). O
fechamento é do que a fase publica: fase de repositório misto que publica app fecha pelo
`fechamento-app.md`; a que publica módulo, por este; a que publica os dois, pelos dois, módulo
primeiro (§ 3).

## 1. Merge

A regra é a do núcleo, sem nada próprio daqui: a resposta do dono na preparação do arco
(`SKILL.md` § 2.4) decide, e o fallback de execução é o da `SKILL.md` § 6.2.

## 2. Release

Merge de PR de módulo **não gera release**. A release sai pelo workflow `release.yml` do
repositório, disparado por `workflow_dispatch` com o **slug** do módulo no `alvo` — o nome da
pasta em `modulos/`; o workflow recusa o nome que existe também em `apps/`. Ela cunha a tag
`<slug>-m<versao>_<sha8>`, prerelease, com o pacote `<slug>-<versao>.urbimod.tgz` e o sidecar
`.sha256`. Disparar ou esperar segue a resposta do dono na preparação do arco (`SKILL.md` § 2.4),
como na de app: quem dispara é a coordenadora, porque é ação de GitHub, não rota de instância. Rota
de instância com `homolog`, `upgrade`, `release` ou `atestado` no caminho ela não chama nunca
(`SKILL.md` § 2.4).

A instalação pode **reiniciar a instância de teste**, como a de app: o auto-update é opt-in por
módulo e a coordenadora não sabe se está ligado sem olhar. Na dúvida, trate como reinício:
**nunca dispare release com QA rodando**. Confira antes, no checklist, que nenhuma filha de QA
está viva.

## 3. Espera da instalação

O módulo chega à instância pelo **canal de módulo**: Admin › Instaláveis › Módulos, instalando
ou atualizando **pelo repositório** (a release `-m`). Com o auto-update ligado para o módulo, a
versão chega sozinha; desligado, instalar é do dono — é da alçada Apps, a mesma do ciclo de app —,
e a coordenadora pede e espera: ela não instala.

**Módulo antes de app.** Uma app que depende do módulo numa versão que a instância ainda não tem
não sobe: fica com falha de carga, com o motivo nomeando a dependência. Fase que publica módulo e
app consumidora espera o módulo instalado antes de soltar a release da app.

QA só se dispara contra a **versão da release instalada**. O prompt de QA leva a versão esperada
(a do manifesto do módulo; a tag é dado à parte, só do relatório), e a filha a confere na lista de
módulos da instância — `GET /api/shell/modulos`, campo `versao` do slug —, que pede a alçada Apps
no QA Principal. Não conseguindo confirmar, ela reporta "incompleto" em vez de validar o que não
foi pedido.

## 4. QA e aviso

QA pela skill `qa`, pelo `prompt-qa.md` (`SKILL.md` § 7.2), com a linha de módulo do modelo
preenchida. **Módulo se exercita sob a alçada `nucleo`:** é ela que abre a tela do módulo e o mount
direto `/api/modulos/<slug>/…`, e o QA Principal sem ela deixa a tela e o mount como lacuna — peça
ao dono que a conceda **antes** de disparar. As rotas que as apps consomem
(`/api/<app>/modulos/<slug>/…`) se exercitam por uma app que dependa do módulo, com as flags que
ela pediu ligadas.

O aviso de "pronto" ao dono diz: os PRs mergeados, a release (tag `-m`), a versão instalada na
instância de teste (a que a QA confirmou; sem confirmação não há QA completo, então não há aviso de
pronto), o resultado do QA (com o link do comentário no PR) e a lista de verificação visual
pendente da tela do módulo. Homologar a release, quando a instância pede, é do dono: ele entra em
Admin › Instaláveis › Módulos › <módulo> › Upgrades e homologa.
