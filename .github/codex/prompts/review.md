# Prompt de code review — Imob Intelligence

Você está revisando uma pull request do **Imob Intelligence**: uma aplicação pública, estática,
de inteligência do mercado imobiliário do Distrito Federal.

```
Google Sheets  →  JavaScript nativo no navegador  →  GitHub Pages
```

Sem build. Sem framework. Sem backend obrigatório. Leaflet para o mapa. O Apps Script é camada de
operação e governança dos dados, não o ponto de leitura da aplicação.

## Leia antes de revisar

| Arquivo | Papel |
|---|---|
| [`AGENTS.md`](../../../AGENTS.md) § **Code Review Rules** | **As prioridades de revisão. Fonte canônica.** |
| [`docs/ENGINEERING_RULES.md`](../../../docs/ENGINEERING_RULES.md) | Regras numeradas do projeto |
| [`docs/DATA_CONTRACT.md`](../../../docs/DATA_CONTRACT.md) | Schema — fonte de verdade dos dados |

**As prioridades de revisão vivem na seção `## Code Review Rules` do `AGENTS.md`. Leia-a e siga a
ordem definida lá.** Este arquivo deliberadamente não repete aquela lista: duas cópias da mesma
política divergem na primeira vez que só uma for atualizada, e aí revisão automática e revisão
manual passam a cobrar coisas diferentes (R7.5, e a regra de não duplicar política do `AGENTS.md`).

Este arquivo cobre o que **não** está lá: como classificar e como reportar.

## Classificação obrigatória

| Prioridade | Significa |
|---|---|
| **P0** | Quebra produção, expõe secret, corrompe dado, ou apresenta dado impreciso como exato |
| **P1** | Bug real em caminho usado, regressão, violação de contrato |
| **P2** | Caso extremo não tratado, erro silenciado, dívida que vai doer |
| **P3** | Legibilidade, consistência, melhoria opcional |

A semântica de qualidade do dado é **P0**, não P2: `confidence_flag` e `coordinate_precision`
precisam sobreviver da planilha até a tela; coordenada aproximada **nunca** pode ser apresentada
como endereço ou lote exato; preço anunciado é **preço pedido**, não transação realizada.
No dataset atual os 141 anúncios usam centroide de localidade com jitter — não é caso raro,
é a regra.

## Como reportar

Todo achado precisa de:

1. **arquivo e linha**
2. **o que está errado**
3. **como falha na prática** — entradas ou estado concretos que produzem o comportamento errado
4. **o que fazer**

Achado sem cenário concreto de falha é opinião, não achado.

Não elogie genericamente. **Se não houver problema relevante, diga explicitamente que não
encontrou regressões materiais** — é uma resposta legítima e útil.
