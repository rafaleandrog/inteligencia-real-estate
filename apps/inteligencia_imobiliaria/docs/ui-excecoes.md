---
titulo: Exceções de UI
descricao: Registro de exceções de UI da app (C-58) — o que é HTML próprio e por quê.
---

# Exceções de UI

Toda tela da app usa primitivos `urbi-*` e tokens. O que o catálogo não cobre entra aqui, no
mesmo PR do HTML. Sem linha neste registro, não é exceção: é violação.

| Superfície | Por quê | O que pode |
|---|---|---|
| Legenda do Mapa (`intel-imob-legenda`) | o `urbi-mapa` não tem legenda nativa e trata a cor da feição como dado do consumidor (C-67, D-94) | amostra de cor da classe: `span` com `style="background: <cor>"` e tamanho mínimo, ao lado de `urbi-prosa`; as cores vêm de `comum/mapa.ts`, a mesma tabela que pinta as feições |
| Cor das feições do Mapa | cor é dado da feição (`properties.estilo`), não chrome — linha "urbi-mapa" do registro do SDK | literais de cor em `comum/mapa.ts` |
