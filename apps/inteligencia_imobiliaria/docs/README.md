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
- **Cadastro** (`/cadastro`): anúncios, lançamentos, âncoras, contornos (KML/KMZ ou desenho),
  localidades e fontes, cada aba com lista filtrável, ficha, histórico, "Baixar CSV", "Importar CSV" e
  "Baixar modelo". Editar e remover exigem o papel **curador** (fontes: **operador**).
- **Operação** (`/operacao`): importações CSV com prévia, aplicar e desfazer, e os achados de
  qualidade. Ver [Importação](importacao.md).
- O menu da app tem onze áreas. Cada área entra numa fase; a tela diz quando.
- O contrato das tabelas está em [Dados](dados.md).

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
- Território: `GET /cidades`, `GET /localidades?cidade&tipo&q`, `GET /localidades/:id`,
  `GET /contornos?grupo&tipo_entidade&status&bbox=o,s,l,n` (GeoJSON; `formato=lista` ou `csv`).
- Cadastros: `GET /anuncios|/lancamentos|/ancoras|/fontes` (filtros, `pagina`, `formato=csv`),
  `GET /:id`, `GET /:id/historico`, `GET /:id/eventos` (anúncios e lançamentos), `POST`,
  `PATCH /:id` com `versao` (`409 CONFLITO_VERSAO`), `PATCH /:id/remover` e `/restaurar`.
- Importação e carga por agente: ver [Importação](importacao.md).
