---
name: imob-appscript
description: Qualquer mudança no Google AppsScript — setup da planilha, validação, logs, gatilhos, dataset version, manutenção, endpoints, integrações Google e automações administrativas.
---

# imob-appscript

O Apps Script é a **camada de operação, automação, validação e governança dos dados** —
não o ponto de leitura da aplicação. Enquanto a leitura direta da Google Sheet via GViz for
simples e confiável, ela continua sendo o caminho principal do site.

Arquivo: `optional-apps-script/Code.gs`.

## Responsabilidades

setup da planilha · validação · logs · gatilhos · dataset version · manutenção · endpoints ·
integrações Google · automações administrativas.

## Ordem de prioridade

```
correção → idempotência → segurança → observabilidade → simplicidade
```

Nessa ordem. Código elegante que roda duas vezes e duplica linha é código errado.

## Idempotência

`setupProject()` roda mais de uma vez, sempre. As abas `APP_META`, `DATA_QUALITY` e `CHANGE_LOG`
**já existem** na planilha importada, com os cabeçalhos corretos. A função completa o que falta e
**não sobrescreve** o que já está lá.

Toda função de setup ou manutenção precisa ser segura para reexecução.

## Concorrência

Use `LockService` sempre que duas execuções puderem escrever ao mesmo tempo — o trigger de edição
e o job de manutenção disputam as mesmas abas. Sem lock, você perde escrita.

## Segurança

- **Não armazene segredo em célula.** Configuração privada vai em Script Properties.
- Endpoint é **read-only** na V1: apenas `health`, `meta` e `dataset`, com **allowlist** de
  datasets. Sem `doPost` público. Sem endpoint de administração.
- Se mantiver JSONP como fallback, **valide rigorosamente o nome do callback** — é injeção de
  script direta caso contrário.

## Custo de execução

Não rode validação pesada a cada célula editada. O trigger de edição faz o mínimo:

```
registrar mudança → incrementar dataset_version → marcar validation_status = dirty → invalidar cache
```

A validação completa fica no job periódico. Se o dataset crescer muito, reavalie frequência e custo.

## Dados ruins

**Nunca apague automaticamente registro ruim.** Primeiro sinalize em `DATA_QUALITY`. A decisão de
remover é humana.

## Campo derivado

`asking_price_brl_m2` só é calculado quando **vazio** e existem `asking_price_brl` e `area_m2`.
Valor já preenchido não é sobrescrito na V1 — divergência grande vira alerta, não sobrescrita.
