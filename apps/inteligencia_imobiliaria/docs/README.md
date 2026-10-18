---
titulo: Inteligência Imobiliária
descricao: Oferta, mercado e território do mercado imobiliário do DF, com dado rastreável.
---

# Inteligência Imobiliária

A app reúne, numa instância UrbiVerso, o que o site público de inteligência imobiliária
(`rafaleandrog/inteligencia-real-estate`) mostra hoje, com cadastro próprio e ligação ao
núcleo imobiliário da plataforma. O desenho completo está em `docs/SPEC_URBIVERSO.md` do
repositório; o recorte da primeira versão, em `docs/MVP_PROPOSTA.md`.

## Para quem usa

- **Início** (`/`): atalhos para as áreas que já existem. As demais aparecem como "em construção".
- O menu da app tem onze áreas. Cada área entra numa fase; a tela diz quando.

## Para o administrador

- **Acesso.** A liberação é por pessoa. Confira, na instalação, que a permissão padrão da app está
  em **nenhuma** (Admin › Instaláveis › Apps › Acesso).
- **Papéis.** `curador` (insere e corrige dados), `operador` (importações e qualidade),
  `estrategico` (vê áreas próprias, nível leitura) e `decisor` (decide sobre áreas). O admin da
  app faz tudo.
- **Ativação.** O checklist da instalação está em [Ativação](ativacao.md).

## Para agentes

- Rotas relativas a `/api/inteligencia_imobiliaria/`. Erro responde
  `{ erro: true, codigo, mensagem, detalhes? }`, com `detalhes` sempre lista de texto.
- `GET /inicio` → `{ versao, atalhos: [{ titulo, rota, icone, descricao, disponivel }] }`.
