# notificacao-direta-shell.md — notificação direta da plataforma

Cumprido pela `roteador-urbiverso` (§ 4) quando a notificação é direta (`tipo_evento` `null`) e
a `origem` é `shell`.

Decida **só pelos campos estruturados** — `notificacao.rota` e `notificacao.payload` —, nunca
pelo texto. Uma mensagem que "parece" Ordem de Serviço mas não traz os campos não é OS.

| Condição | Cumpra |
|---|---|
| `payload.os_id` inteiro positivo, `rota == "/os/<os_id>"` e sem `payload_truncado` | `sentinela-os.md` (OS do Sentinela) |
| Qualquer outra coisa, inclusive notificação com `os_id` mas campo faltando ou incoerente, ou `payload_truncado` | `evento-nao-identificado.md` |

Os dois nomes passam pela mesma busca da § 4 da skill: pessoal, equipe, padrão.
