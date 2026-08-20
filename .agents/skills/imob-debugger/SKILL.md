---
name: imob-debugger
description: Investigar bug, erro de console, tela quebrada, mapa que não aparece, dado que não carrega, filtro incorreto, falha do Apps Script ou divergência entre GitHub Pages e local.
---

# imob-debugger

Foco restrito: **descobrir a causa**. A correção vem depois de entender, nunca antes.

## Quando acionar

Bug · erro · tela quebrada · console error · mapa que não aparece · dado que não carrega ·
filtro incorreto · problema de sincronização · Apps Script com falha · GitHub Pages diferente
do local.

## Workflow obrigatório

```
reproduzir
→ coletar evidência
→ reduzir o problema
→ identificar causa raiz
→ corrigir causa
→ criar regressão/teste
→ executar smoke test
```

## A regra que mais importa

**Não aplique várias mudanças aleatórias esperando que alguma resolva.** Se você não sabe por que
funcionou, você não corrigiu — você mascarou.

E: **nunca declare um bug corrigido sem reproduzir antes e verificar depois** (R6.5). Se não
conseguiu reproduzir, isso é o achado — reporte assim, não como correção.

## Reproduzir

1. `python3 -m http.server 8080` e abra `http://localhost:8080`.
2. Console aberto antes de carregar a página.
3. Anote o passo exato que dispara a falha.
4. Teste nos dois modos: `demoMode: true` e a Google Sheet real. A diferença entre os dois
   isola o problema em código *ou* em dado.

## Suspeitos frequentes neste projeto

| Sintoma | Olhe primeiro |
|---|---|
| Mapa não aparece | container sem altura no CSS; Leaflet não carregou; `invalidateSize()` |
| Nenhum ponto no mapa | `latitude`/`longitude` como string; coordenada solitária; fora da faixa |
| Preço/m² absurdo | `area_m2` zero ou nulo; divisão sem guarda |
| Número virou `NaN` | formato brasileiro `"R$ 1.234,56"` não convertido |
| Tela branca | `Promise` sem `catch`; aba obrigatória ausente |
| Funciona local, quebra no Pages | caminho absoluto; diferença de maiúsculas no nome de arquivo |
| Aba opcional derruba tudo | opcional sendo tratada como obrigatória (R2.5) |

## Registre sempre

- **sintoma** — o que se observa
- **causa** — por que acontece
- **correção** — o que mudou
- **teste realizado** — como você provou que resolveu

Bug com causa raiz identificada vira teste de regressão. Sem exceção.
