# Contrato de dados

## Regras gerais

- Uma linha = um registro observável.
- Cabeçalhos em `snake_case` e nunca renomeados sem versionar o contrato.
- IDs são estáveis e únicos.
- Coordenadas em WGS84: `latitude`, `longitude`.
- Valores monetários são números, sem `R$` dentro da célula.
- Datas preferencialmente em `YYYY-MM-DD`.
- Toda informação de mercado deve guardar fonte e data de observação/verificação.
- Coordenada aproximada deve declarar `coordinate_precision` e `confidence_flag`.

## Abas principais

### LISTINGS
Anúncios secundários. Chave: `listing_id`.

Campos críticos: `listing_id`, `title`, `source_url`, `property_type`, `locality`, `latitude`, `longitude`, `asking_price_brl`, `area_m2`, `asking_price_brl_m2`, `bedrooms`, `observed_at`, `confidence_flag`.

### DEVELOPMENTS
Empreendimentos canônicos. Chave: `development_id`.

### ANCHORS
Pontos de interesse. Chave: `place_id`.

### PRIMARY_MARKET
Um registro agregado por empreendimento/oferta primária para uso rápido no mapa.

### PRIMARY_OFFERS
Observações unitárias do mercado primário. Essa aba preserva granularidade e permite recalcular agregações.

### IVV_MONTHLY / IVV_REGION
Mantidas desde o modelo anterior, mas não precisam aparecer na tela inicial da V1.

### RA_PROFILES
Indicadores territoriais por RA. Não entram no primeiro mapa visual, mas permanecem disponíveis para a fase analítica.

## Qualidade

Nunca apresente uma coordenada aproximada como lote exato. A interface deve carregar o `confidence_flag`/`coordinate_precision` para permitir avisos e auditoria.
