# Plano de produto — V1 minimalista

## Objetivo

Transformar o modelo atual em uma experiência pública simples para responder primeiro a quatro perguntas:

1. O que existe nesta região?
2. Quanto custa?
3. Como o preço por m² se compara?
4. Qual é a fonte e a qualidade do dado?

## O que aparece na V1

- Mapa ocupando praticamente toda a tela.
- Busca por localidade, anúncio e empreendimento.
- Filtros essenciais: localidade, tipo, preço e quartos.
- Quatro entidades: anúncios, mercado primário, empreendimentos e âncoras.
- Dois KPIs rápidos: quantidade visível e preço mediano/m².
- Card de detalhe ao clicar em um ponto, sempre com link da fonte quando disponível.
- Indicador de qualidade/confiança espacial.

## O que fica escondido na V1

- Heatmap e hexágonos.
- IVV completo e ranking regional.
- Desenho de áreas e análise por raio.
- Medição de distância e área.
- Buffers de metrô e rodovias.
- Comparador de até três áreas.
- Choropleth territorial.
- Vistas salvas.

Nada disso é descartado. A referência antiga fica no repo e essas funções entram quando houver uma necessidade de usuário comprovada.

## Evolução

### Fase 1 — Explorar
Mapa, busca, filtros, detalhes e fontes.

### Fase 2 — Entender
Cards de localidade, preço/m² mediano, volume de oferta, lançamentos, IVV e tendência.

### Fase 3 — Analisar
Raio, desenho de área, mobilidade, âncoras, comparação e score transparente.

### Fase 4 — Decidir
Watchlists, alertas, relatórios, cenários, oportunidades e histórico temporal.

### Fase 5 — Escalar
Banco geoespacial dedicado, autenticação, ingestão automatizada, tiles/vetores e APIs versionadas.
