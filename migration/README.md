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
| `PRIMARY_MARKET` | obrigatória | 12 |
| `PRIMARY_OFFERS` | opcional | 29 |
| `IVV_MONTHLY` | opcional | 1 |
| `IVV_REGION` | opcional | 95 |
| `RA_PROFILES` | opcional | 35 |
| `APP_META` | operacional (Apps Script) | vazia |
| `DATA_QUALITY` | operacional (Apps Script) | vazia |
| `CHANGE_LOG` | operacional (Apps Script) | vazia |

As três abas operacionais vêm com cabeçalho e sem linhas — é o Apps Script que as preenche.
`setupProject()` deve completá-las sem sobrescrever o que já existir.

## Como importar

Google Drive → **Novo** → **Upload de arquivo** → selecione o `.xlsx` → abrir com Google Planilhas.
**Preserve exatamente os nomes das abas.**

Depois siga [`../docs/SHEET_SETUP.md`](../docs/SHEET_SETUP.md).

## Por que isto não viola a regra anti-dessincronização

[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) proíbe commitar snapshot de dados **para
produção** — o navegador nunca lê este arquivo. Ele existe para semear a planilha uma vez.

Depois de importado, a fonte de verdade é a Google Sheet. Este `.xlsx` **não** é atualizado a cada
mudança de dado, e ninguém deve tratá-lo como se estivesse em dia.
