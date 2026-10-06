# AGENTS.md

Porta de entrada para qualquer agente de IA que trabalhe neste repositório.
Regras detalhadas: [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) — **fonte canônica**.

Se outra ferramenta exigir arquivo próprio (`CLAUDE.md`, `.cursorrules`, etc.), esse arquivo deve
**apontar para cá**, nunca repetir as regras. Política duplicada é política dessincronizada.

## O que é este projeto

Aplicação pública de inteligência do mercado imobiliário do Distrito Federal.

```
Google Sheets  →  navegador (JS nativo + Leaflet)  →  GitHub Pages
```

Estática, sem build, sem backend obrigatório. **Código mora no GitHub. Dados moram na Google Sheet.**

Uma exceção nomeada (R2.7–R2.9): `data/public/` guarda **dado derivado de fonte pública oficial**
(IBGE, Ipea, OpenStreetMap, GeoPortal), gerado por `pipeline/` e publicado só por PR automática —
não é snapshot da planilha. O site o lê pelo `manifest.json`, na mesma origem do Pages.

## Antes de mudar qualquer coisa

1. Leia o [`README.md`](README.md).
2. Se for mexer em ingestão, schema, CSV ou planilha: leia [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) **antes**.
3. Se for mexer no Apps Script: leia [`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md).
4. Escolha a skill certa em [`.agents/skills/`](.agents/skills/) e siga o workflow dela.
5. Se for mexer em `pipeline/`, `data/public/`, no manifest, nos schemas ou em `src/territorio/`
   (ou fizer o site ler um arquivo público novo): leia a seção "Arquivos públicos —
   data/public/" do [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) e a skill `imob-pipeline`.
   Três regras que não se negociam:
   - **Nada em `data/public/` é editado à mão** (R2.8). Mudou o dado, muda no pipeline e regera;
     a única porta de entrada em `main` é a PR automática do `dados-publicos.yml`.
   - **Arquivo público ausente é aviso, nunca erro** (R2.5, R2.7): manifest ou arquivo faltando
     desabilita o controle com o motivo escrito (R8.64) e o resto do site abre igual; arquivo
     cujo hash difere do manifest é recusado, nunca desenhado.
   - **Mudou o manifest, um dataset ou um schema? Regenere `tests/fixtures/public/` pelo
     pipeline** — o comando está em [`pipeline/README.md`](pipeline/README.md) ("Fixtures do
     site") — e rode `npm test` e `npm run smoke`. Fixture também não se edita à mão.

## Obrigações inegociáveis

- **Nunca declare um bug corrigido sem reproduzir o comportamento antes e depois.** "Deve estar
  resolvido" não é uma conclusão aceitável.
- **Nunca altere o schema em silêncio.** Renomear um cabeçalho sem atualizar contrato, loader,
  validação e testes é a falha mais cara possível aqui.
- **Nunca commite secret.** Chave de API, token do Google, token do GitHub — nada disso entra no
  repositório nem em `src/config.js`. O ID da planilha e a URL do `/exec` são públicos por design;
  qualquer outra coisa não é.
- **Preserve [`reference/index-v3.html`](reference/index-v3.html).** É a referência funcional do
  modelo anterior e a origem do dataset. Não reescreva, não reformate, não apague.
- **Mantenha o diff pequeno.** Não misture refatoração ampla com feature pequena.
- **Rode os testes** (`npm test`) depois de qualquer mudança em código.
- **Aba escondida da planilha não é segurança.** Tudo que o navegador lê é público.

## Ao terminar, relate sempre

- arquivos modificados;
- testes executados e o resultado real;
- o que você verificou manualmente;
- riscos que permanecem.

Pendência real se declara. Não se esconde atrás de "feito".

## Code Review Rules

Esta seção é lida pelo Codex ao revisar PRs deste repositório. Priorize nesta ordem e reporte
apenas o que for material — não elogie genericamente.

1. **Regressões** — algo que funcionava e parou.
2. **Bugs e casos extremos** — registro sem coordenada, sem preço, campo nulo, array vazio,
   número em formato brasileiro (`"R$ 1.234,56"`), data fora do padrão, divisão por zero em
   preço/m², mediana de lista vazia.
3. **Contrato de dados** — cabeçalho renomeado, campo removido, tipo alterado ou aba obrigatória
   tratada como opcional sem atualizar `docs/DATA_CONTRACT.md` na mesma PR.
4. **Segurança** — secret versionado; string de dado indo para `innerHTML` sem escaping; link
   externo sem `rel="noopener noreferrer"`; URL sem validação de esquema (só `http`/`https`);
   parâmetro do Apps Script sem allowlist; qualquer escrita pública na planilha.
5. **Semântica de qualidade espacial** — `confidence_flag` e `coordinate_precision` precisam
   sobreviver ao pipeline. **Coordenada aproximada nunca pode ser apresentada como endereço
   exato.** A maioria dos listings usa centroide de localidade com jitter.
6. **Google Sheets / GViz** — parsing do envelope, aba ausente, célula vazia, tipo de coluna.
   Aba **opcional** ausente é warning, nunca erro fatal. O mesmo vale para `data/public/`
   (R2.5, R2.7): manifest ou arquivo público ausente é aviso e controle desabilitado com motivo,
   nunca erro; arquivo cujo hash difere do manifest é recusado, nunca desenhado.
7. **Apps Script** — idempotência, `LockService` onde há escrita concorrente, endpoint read-only
   com allowlist, segredo em Script Properties e nunca em célula.
8. **GitHub Pages** — caminho relativo, ausência de build, nada que dependa de servidor.
9. **Loading e error state** — `Promise` sem `catch`, falha de rede levando a tela branca.
10. **Mobile** — usável em 390 px de largura.
11. **Performance** — trabalho desnecessário no loop de render ou no filtro.

Se não houver problema relevante, **diga explicitamente que não encontrou regressões materiais**.

### Uma rodada, não três

Revisão existe para impedir defeito grave em produção, não para convergir estilo.

- **P0 ou P1 em aberto** → corrija e peça nova revisão, que cobre só esses.
- **Só P2/P3, ou nada** → **merge imediato.** Corrija o que for trivial; o resto vira backlog.

Achado que só aparece na terceira rodada era achado que faltou na primeira.


**Cada achado é independente e resolvível sozinho:** um arquivo, um problema, uma correção.
Não agrupe três defeitos num comentário só, e não divida um mesmo defeito em três comentários.
Se dois achados exigem a mesma correção, são um achado.

Quem implementa tem a contrapartida: **corrigir todos os achados de uma rodada em um único push**,
com evidência de reprodução quando o achado for de comportamento.
