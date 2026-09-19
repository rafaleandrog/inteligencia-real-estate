# optional-apps-script/

Camada de **operação, automação, validação e governança** dos dados.

**Não é o ponto de leitura da aplicação.** O site lê a planilha direto via Google
Visualization Query enquanto isso for simples e confiável. Ver `docs/ARCHITECTURE.md`.

## Estado

`Code.gs` **v2.4.0** roda na planilha de produção desde a v2.0.0; cada versão é exercitada em
`tests/appsscript-*.test.js` num sandbox `vm` que carrega o arquivo real (não uma cópia). O que o
sandbox não cobre — rede (GeoPortal, DER), Drive, KMZ, `openById` do staging FipeZAP — lança de
propósito em teste e só é verificado na planilha. O runbook de instalação/sincronização está em
`docs/SHEET_SETUP.md` §9.

**Sincronia é obrigação, não desejo:** o arquivo salvo no editor do Apps Script, a versão implantada
no `/exec` e este arquivo precisam ser o mesmo código. A v2.4.0 existe porque a planilha rodava um
adendo FipeZAP que nunca chegou ao repositório enquanto o repositório tinha a sincronização
territorial que nunca chegou à planilha (issue #120).

## Instalação

1. Na planilha: **Extensões → Apps Script**
2. Cole o conteúdo de `Code.gs`
3. Execute `setupProject()` uma vez — é idempotente e **não sobrescreve** as abas
   `APP_META`, `DATA_QUALITY` e `CHANGE_LOG` que já vêm na planilha importada
4. Execute `validateAll()`
5. Execute `installTriggers()`

Depois disso o menu **Imob Intelligence** aparece ao abrir a planilha.

## O que ele faz

| Função | Papel |
|---|---|
| `onOpen()` | Menu **Imob Intelligence** (17 itens na v2.4.0, em cinco grupos) |
| `setupProject()` | Cria o que falta nas abas operacionais, idempotente |
| `installTriggers()` | Gatilho de edição + manutenção a cada 6 h |
| `handleEdit(e)` | Registra → incrementa versão → marca `dirty` → invalida cache |
| `validateAll()` | Preenche `DATA_QUALITY` |
| `recalculateDerivedFields()` | `asking_price_brl_m2` **só quando vazio** |
| `refreshMeta()` | Atualiza `APP_META` |
| `maintenanceJob()` | Derivados → validação → metadados |
| `doGet(e)` | Endpoint **read-only**: `health`, `meta`, `dataset`, `fipezap` (v2.4.0) |
| `doPost(e)` | Endpoint de **escrita** autenticado por `ADMIN_TOKEN` (issue #5, R4.9) — ver `docs/SHEET_SETUP.md` §8 |
| `normalizeMonetaryCells()` | Saneamento: texto `R$ …` em LISTINGS/DEVELOPMENTS vira número, célula a célula no CHANGE_LOG |
| `normalizeFipezapPeriodCells()` | Saneamento: `period_id` → texto `YYYY-MM`, `reference_date` → texto `YYYY-MM-DD` |
| `provisionIvvRegion()` | Cria `IVV_REGION` com o cabeçalho do contrato; o dado é colado à mão |
| `buildListingsCoverage()` | Reescreve `LISTINGS_COVERAGE` (RA × tipo × quartos × faixa de preço) |
| `buildPdadCoverage()` | Reescreve `PDAD_A_COVERAGE` (RA × indicador autorizado em PDAD_A_FIGURE_MAP) |
| `syncFipezapFromStaging_()` | Copia as cinco abas FipeZAP da planilha de staging (ID fixo no código) |
| `rebuildFipezapLocalityMonthly_()` | Reconstrói a visão venda + locação por período × segmento × localidade |
| `validateFipezapDataset_()` | Regras semânticas da série (período, segmento, operação, fonte, RA, duplicidade, lacuna) |
| `validateIvvRegion_()` | Faixa, mês, duplicidade, escala em p.p. e conferência publicado × sold/offered |

### Formato de `?resource=meta`

Devolve as **linhas** de `APP_META`, não um objeto achatado:

```json
{ "rows": [ { "key": "dataset_version", "value": "7", "updated_at": "2026-08-20" } ], "count": 1 }
```

Achatar no servidor destruía a evidência de chave duplicada — um objeto JSON não guarda duas
chaves iguais, e a última linha vencia, que é justamente a duplicata antiga. Com as linhas
cruas, GViz e Apps Script passam pelo mesmo normalizador no cliente e tratam conflito igual.

## Decisões de segurança

- **Leitura pública, escrita só com token.** `doGet` é read-only e sem autenticação; `doPost`
  exige `ADMIN_TOKEN` em Script Properties em toda chamada e só aceita aba e campo de allowlist
  (`WRITE_ALLOWLIST`/`FIELD_SCHEMA`). As abas FipeZAP, PDAD e de cobertura nunca são graváveis pela API.
- **Allowlist de datasets.** O parâmetro `name` é conferido contra uma lista fechada; sem isso
  serviria para ler qualquer aba da planilha.
- **Callback JSONP validado** contra identificador JavaScript simples — caso contrário o
  parâmetro é injeção de script na página que consome o endpoint.
- **`LockService`** onde o gatilho de edição e o job de manutenção disputam as mesmas abas.
- **Segredo em Script Properties, nunca em célula.**
- **Registro ruim é sinalizado, nunca apagado.** A decisão de remover é humana.

## Duplicação consciente

`toNumber_()` no `Code.gs` espelha `toNumber()` de `src/normalize.js`. São ambientes diferentes
— Apps Script não importa módulo ES — então a duplicação é inevitável. **Mudou em um, muda no
outro**, e `tests/appsscript-money-parity.test.js` cobra a paridade entrada por entrada. É a única
duplicação de lógica aceita no projeto, e está registrada aqui por isso.
