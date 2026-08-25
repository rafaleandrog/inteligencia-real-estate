# migration/

**Semente de importação. Não é fonte de runtime.**

## `imob-intelligence-backend.xlsx`

Réplica do dataset do modelo anterior, já no formato das abas da Google Sheet. Serve para
inicializar a planilha de uma vez, sem migração manual.

12 abas:

| Aba | Papel | Linhas de dado |
|---|---|---|
| `README` | instruções internas da planilha | — |
| `LISTINGS` | obrigatória | 141 |
| `DEVELOPMENTS` | obrigatória | 22 |
| `ANCHORS` | obrigatória | 35 |
| `PRIMARY_OFFERS` | opcional | 29 |
| `IVV_MONTHLY` | opcional | 1 |
| `IVV_REGION` | opcional | 95 |
| `RA_PROFILES` | opcional | 35 |
| `APP_META` | operacional (Apps Script) | vazia |
| `DATA_QUALITY` | operacional (Apps Script) | vazia |
| `CHANGE_LOG` | operacional (Apps Script) | vazia |

As três abas operacionais vêm com cabeçalho e sem linhas — é o Apps Script que as preenche.
`setupProject()` deve completá-las sem sobrescrever o que já existir.

## Esta semente está deliberadamente atrás do schema

O arquivo reproduz o schema da **v1.0.0** do Apps Script. O backend está na v2.0.0, que acrescentou
colunas às três abas obrigatórias e a aba `POLYGONS`, que aqui **não existe**. Isso é intencional,
não esquecimento:

- A semente é um bootstrap de uma vez só. Reexportá-la a cada mudança de schema dobraria dado de
  produção dentro de um artefato de migração — o fluxo `Sheet → commit` que
  [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) proíbe.
- Não é preciso: `setupProject()` provisiona as colunas que faltam de forma aditiva, logo depois da
  importação. Uma planilha semeada por este `.xlsx` chega ao schema em vigor pelo menu, não por
  edição manual.

O delta exato entre este arquivo e o schema atual está na tabela **Provisionamento pós-semente** de
[`docs/DATA_CONTRACT.md`](../docs/DATA_CONTRACT.md), e é verificado por
`tests/setup-provisioning.test.js`, que executa o `setupProject()` real sobre estes cabeçalhos e
afirma que ele cria **exatamente** aquela lista — nada a mais. No dia em que alguém reexportar a
planilha, aquela tabela encolhe e o teste obriga a lista a encolher junto.

## Como importar

Google Drive → **Novo** → **Upload de arquivo** → selecione o `.xlsx` → abrir com Google Planilhas.
**Preserve exatamente os nomes das abas.**

Depois siga [`../docs/SHEET_SETUP.md`](../docs/SHEET_SETUP.md).

## Por que isto não viola a regra anti-dessincronização

[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) proíbe commitar snapshot de dados **para
produção** — o navegador nunca lê este arquivo. Ele existe para semear a planilha uma vez.

Depois de importado, a fonte de verdade é a Google Sheet. Este `.xlsx` **não** é atualizado a cada
mudança de dado, e ninguém deve tratá-lo como se estivesse em dia.
