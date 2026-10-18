---
titulo: Exceções de UI
descricao: Registro de exceções de UI da app (C-58) — o que é HTML próprio e por quê.
---

# Exceções de UI

Toda tela da app usa primitivos `urbi-*` e tokens. O que o catálogo não cobre entra aqui, no
mesmo PR do HTML. Sem linha neste registro, não é exceção: é violação.

| Superfície | Por quê | O que pode |
|---|---|---|
| Legenda do Mapa (`intel-imob-legenda`) | o `urbi-mapa` não tem legenda nativa e trata a cor da feição como dado do consumidor (C-67, D-94) | amostra de cor da classe: `span` com `style="background: <cor>"` e tamanho mínimo, ao lado de `urbi-prosa`; a cor é a mesma que pinta a feição |

As cores das feições não são literais: vêm dos tokens do tema (`--cor-mapa-contorno`,
`--cor-categoria-*`, `--cor-info` → `--cor-erro` na rampa de preço/m²), resolvidos em JS por
`frontend/componentes/cores.ts` e reamostrados quando o tema muda (ui.md § Resolver cor em JS).

## Dispersão em tabela (Mercado › IVV por localidade e Diagnóstico › Dispersão)

O SDK 100 não tem `urbi-grafico-dispersao`. As leituras cruzadas (IVV × preço, IVV × oferta,
gap × preço; as nove do Diagnóstico) saem como `urbi-tabela` de pontos, com os dois eixos e,
no Diagnóstico, a correlação de Pearson descritiva. Quando o SDK publicar um gráfico de
dispersão, a tela troca a tabela por ele sem mudar a rota.
