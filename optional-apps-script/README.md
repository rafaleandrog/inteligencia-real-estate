# optional-apps-script/

Camada de **operação, automação, validação e governança** dos dados.

**Não é o ponto de leitura da aplicação.** O site lê a planilha direto via Google
Visualization Query enquanto isso for simples e confiável. Ver `docs/ARCHITECTURE.md`.

## Estado

`Code.gs` está **escrito e com sintaxe verificada, mas ainda não executado numa planilha real.**
Nenhuma das funções foi validada contra o Apps Script de verdade — trate como implementação
pendente de verificação, não como recurso pronto.

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
| `onOpen()` | Menu com os 6 itens |
| `setupProject()` | Cria o que falta nas abas operacionais, idempotente |
| `installTriggers()` | Gatilho de edição + manutenção a cada 6 h |
| `handleEdit(e)` | Registra → incrementa versão → marca `dirty` → invalida cache |
| `validateAll()` | Preenche `DATA_QUALITY` |
| `recalculateDerivedFields()` | `asking_price_brl_m2` **só quando vazio** |
| `refreshMeta()` | Atualiza `APP_META` |
| `maintenanceJob()` | Derivados → validação → metadados |
| `doGet(e)` | Endpoint **read-only**: `health`, `meta`, `dataset` |

## Decisões de segurança

- **Read-only.** Não existe `doPost` nem endpoint de administração.
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
outro.** É a única duplicação de lógica aceita no projeto, e está registrada aqui por isso.
