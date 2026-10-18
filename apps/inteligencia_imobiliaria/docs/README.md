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
  - **Atributos**: o catálogo de parâmetros que a equipe acrescenta aos objetos sem release
    (número com unidade, texto, data, sim/não ou opção). Cada ficha de anúncio, lançamento, âncora e
    contorno ganha o bloco "Atributos", por grupo, com fonte e data. As listas filtram por faixa
    (`atr_<codigo>_min`/`_max`) e o CSV traz uma coluna `atr_<codigo>` por atributo ativo.
  - **Vínculos com o núcleo**: contornos e lançamentos se ligam a lote, gleba, unidade,
    parcelamento ou incorporação do módulo imobiliário. A ficha mostra, separado, o que o núcleo
    devolve agora ("cadastro oficial · lido agora") e o que é da pesquisa ("app"); nada do núcleo é
    copiado. A aba lista todos os vínculos e os que não resolvem (removido no núcleo ou sem
    permissão de leitura).
- **Mapa** (`/mapa`): a camada **Núcleo** desenha os objetos vinculados pela geometria da própria
  app, com o selo; o traçado oficial do lote fica para quando o SDK publicar o módulo `geo`.
- **Operação** (`/operacao`): importações CSV com prévia, aplicar e desfazer, os achados de
  qualidade e as execuções. Ver [Importação](importacao.md), inclusive a migração da planilha.
- O menu da app tem onze áreas. Cada área entra numa fase; a tela diz quando.
- O contrato das tabelas está em [Dados](dados.md).

## Para o administrador

- **Acesso.** A liberação é por pessoa. Confira, na instalação, que a permissão padrão da app está
  em **nenhuma** (Admin › Instaláveis › Apps › Acesso).
- **Papéis.** `curador` (insere e corrige dados), `operador` (importações e qualidade),
  `estrategico` (vê áreas próprias, nível leitura) e `decisor` (decide sobre áreas). O admin da
  app faz tudo.
- **Ativação.** O checklist da instalação está em [Ativação](ativacao.md).
- **Núcleo imobiliário.** A app declara o módulo `imobiliario` ≥ 1.0.0 com leitura em `imoveis`,
  `parcelamentos`, `incorporacoes`, `matriculas` e `setores_habitacionais`. Sem o módulo instalado a
  app não sobe; com uma flag desligada, a seção do núcleo mostra o aviso "o admin da instância
  precisa ligar a leitura na aba Núcleo da app" e o resto da tela funciona.

## Para agentes

- Rotas relativas a `/api/inteligencia_imobiliaria/`. Erro responde
  `{ erro: true, codigo, mensagem, detalhes? }`, com `detalhes` sempre lista de texto.
- `GET /inicio` → `{ versao, atalhos: [{ titulo, rota, icone, descricao, disponivel }] }`.
- Território: `GET /cidades`, `GET /localidades?cidade&tipo&q`, `GET /localidades/:id`,
  `GET /contornos?grupo&tipo_entidade&status&bbox=o,s,l,n` (GeoJSON; `formato=lista` ou `csv`).
- Cadastros: `GET /anuncios|/lancamentos|/ancoras|/fontes` (filtros, `pagina`, `formato=csv`),
  `GET /:id`, `GET /:id/historico`, `GET /:id/eventos` (anúncios e lançamentos), `POST`,
  `PATCH /:id` com `versao` (`409 CONFLITO_VERSAO`), `PATCH /:id/remover` e `/restaurar`.
- Filtro por atributo em toda lista de objeto: `atr_<codigo>_min`, `atr_<codigo>_max` e
  `atr_<codigo>=<valor>`; atributo desconhecido ou inativo responde `400 METRICA_DESCONHECIDA`.
- Atributos: `GET /atributos?aplica_a&ativo&grupo`, `GET /atributos/:id`, `POST /atributos`
  (`422 ATRIBUTO_DEF_INVALIDA`), `PATCH /atributos/:id` com `versao` (`409 ATRIBUTO_EM_USO` ao mudar
  código ou tipo com valor gravado), `PATCH /atributos/:id/remover|restaurar`,
  `GET /atributos/:id/distribuicao?objeto_tipo` (só número; mediana e extremos com n ≥ 5, quartis
  com n ≥ 10), `GET /objetos/:tipo/:id/atributos` e `PUT /objetos/:tipo/:id/atributos` com
  `{ valores: [{ atributo_id, valor, fonte, observado_em, versao }] }` (valor nulo apaga;
  `422 ATRIBUTO_VALOR_INVALIDO`, `422 ATRIBUTO_NAO_APLICA`). `:tipo` é `anuncio`, `lancamento`,
  `ancora` ou `contorno` nesta versão.
- Vínculos: `GET /vinculos-nucleo?objeto_tipo&objeto_id&entidade&nucleo_id`,
  `GET /vinculos-nucleo/mapa` (GeoJSON), `POST /vinculos-nucleo` (`objeto_tipo`, `objeto_id`,
  `entidade`, `nucleo_subtipo` quando imóvel, `nucleo_id`, `notas`; `422 VINCULO_NAO_PERMITIDO`,
  `422 VINCULO_NUCLEO_INEXISTENTE`, `403 NUCLEO_FLAG_*`), `PATCH /vinculos-nucleo/:id` (`notas`, com
  `versao`), `PATCH /vinculos-nucleo/:id/remover|restaurar`. O registro do núcleo é lido pelo
  frontend, por `comum/nucleo-cliente.ts`.
- Importação e carga por agente: ver [Importação](importacao.md).
