/**
 * As 35 Regiões Administrativas do DF, semente do `aoIniciar` (spec 4.2, migração passo 0).
 * Gerado de `data/public/ra_crosswalk.json` do site (GeoPortal): `codigo` é o `ra_geo_id`
 * (`RA_01`), `codigo_legado` a grafia antiga dos anúncios (`RA2026_RA-I`). Sem geometria nem
 * perfil: os dois vêm por importação.
 */
export interface RaSemente {
  codigo: string;
  codigo_romano: string;
  codigo_legado: string;
  numero: number;
  nome: string;
  nome_fonte: string;
  area_km2: number;
}

export const RAS_DF: RaSemente[] = [
  { codigo: "RA_01", codigo_romano: "RA-I", codigo_legado: "RA2026_RA-I", numero: 1, nome: "Plano Piloto", nome_fonte: "PLANO PILOTO", area_km2: 437.2014 },
  { codigo: "RA_02", codigo_romano: "RA-II", codigo_legado: "RA2026_RA-II", numero: 2, nome: "Gama", nome_fonte: "GAMA", area_km2: 276.0534 },
  { codigo: "RA_03", codigo_romano: "RA-III", codigo_legado: "RA2026_RA-III", numero: 3, nome: "Taguatinga", nome_fonte: "TAGUATINGA", area_km2: 63.0446 },
  { codigo: "RA_04", codigo_romano: "RA-IV", codigo_legado: "RA2026_RA-IV", numero: 4, nome: "Brazlândia", nome_fonte: "BRAZLÂNDIA", area_km2: 470.1836 },
  { codigo: "RA_05", codigo_romano: "RA-V", codigo_legado: "RA2026_RA-V", numero: 5, nome: "Sobradinho", nome_fonte: "SOBRADINHO", area_km2: 193.5265 },
  { codigo: "RA_06", codigo_romano: "RA-VI", codigo_legado: "RA2026_RA-VI", numero: 6, nome: "Planaltina", nome_fonte: "PLANALTINA", area_km2: 1509.4149 },
  { codigo: "RA_07", codigo_romano: "RA-VII", codigo_legado: "RA2026_RA-VII", numero: 7, nome: "Paranoá", nome_fonte: "PARANOÁ", area_km2: 831.2098 },
  { codigo: "RA_08", codigo_romano: "RA-VIII", codigo_legado: "RA2026_RA-VIII", numero: 8, nome: "Núcleo Bandeirante", nome_fonte: "NÚCLEO BANDEIRANTE", area_km2: 5.0468 },
  { codigo: "RA_09", codigo_romano: "RA-IX", codigo_legado: "RA2026_RA-IX", numero: 9, nome: "Ceilândia", nome_fonte: "CEILÂNDIA", area_km2: 192.6569 },
  { codigo: "RA_10", codigo_romano: "RA-X", codigo_legado: "RA2026_RA-X", numero: 10, nome: "Guará", nome_fonte: "GUARÁ", area_km2: 25.2233 },
  { codigo: "RA_11", codigo_romano: "RA-XI", codigo_legado: "RA2026_RA-XI", numero: 11, nome: "Cruzeiro", nome_fonte: "CRUZEIRO", area_km2: 3.1912 },
  { codigo: "RA_12", codigo_romano: "RA-XII", codigo_legado: "RA2026_RA-XII", numero: 12, nome: "Samambaia", nome_fonte: "SAMAMBAIA", area_km2: 99.9923 },
  { codigo: "RA_13", codigo_romano: "RA-XIII", codigo_legado: "RA2026_RA-XIII", numero: 13, nome: "Santa Maria", nome_fonte: "SANTA MARIA", area_km2: 131.5831 },
  { codigo: "RA_14", codigo_romano: "RA-XIV", codigo_legado: "RA2026_RA-XIV", numero: 14, nome: "São Sebastião", nome_fonte: "SÃO SEBASTIÃO", area_km2: 262.7052 },
  { codigo: "RA_15", codigo_romano: "RA-XV", codigo_legado: "RA2026_RA-XV", numero: 15, nome: "Recanto das Emas", nome_fonte: "RECANTO DAS EMAS", area_km2: 93.1064 },
  { codigo: "RA_16", codigo_romano: "RA-XVI", codigo_legado: "RA2026_RA-XVI", numero: 16, nome: "Lago Sul", nome_fonte: "LAGO SUL", area_km2: 76.0487 },
  { codigo: "RA_17", codigo_romano: "RA-XVII", codigo_legado: "RA2026_RA-XVII", numero: 17, nome: "Riacho Fundo", nome_fonte: "RIACHO FUNDO", area_km2: 17.7811 },
  { codigo: "RA_18", codigo_romano: "RA-XVIII", codigo_legado: "RA2026_RA-XVIII", numero: 18, nome: "Lago Norte", nome_fonte: "LAGO NORTE", area_km2: 75.4917 },
  { codigo: "RA_19", codigo_romano: "RA-XIX", codigo_legado: "RA2026_RA-XIX", numero: 19, nome: "Candangolândia", nome_fonte: "CANDANGOLÂNDIA", area_km2: 6.6019 },
  { codigo: "RA_20", codigo_romano: "RA-XX", codigo_legado: "RA2026_RA-XX", numero: 20, nome: "Águas Claras", nome_fonte: "ÁGUAS CLARAS", area_km2: 9.1866 },
  { codigo: "RA_21", codigo_romano: "RA-XXI", codigo_legado: "RA2026_RA-XXI", numero: 21, nome: "Riacho Fundo Ii", nome_fonte: "RIACHO FUNDO II", area_km2: 38.4672 },
  { codigo: "RA_22", codigo_romano: "RA-XXII", codigo_legado: "RA2026_RA-XXII", numero: 22, nome: "Sudoeste/octogonal", nome_fonte: "SUDOESTE/OCTOGONAL", area_km2: 6.4674 },
  { codigo: "RA_23", codigo_romano: "RA-XXIII", codigo_legado: "RA2026_RA-XXIII", numero: 23, nome: "Varjão", nome_fonte: "VARJÃO", area_km2: 1.6294 },
  { codigo: "RA_24", codigo_romano: "RA-XXIV", codigo_legado: "RA2026_RA-XXIV", numero: 24, nome: "Park Way", nome_fonte: "PARK WAY", area_km2: 118.4056 },
  { codigo: "RA_25", codigo_romano: "RA-XXV", codigo_legado: "RA2026_RA-XXV", numero: 25, nome: "SCIA", nome_fonte: "SCIA", area_km2: 7.3866 },
  { codigo: "RA_26", codigo_romano: "RA-XXVI", codigo_legado: "RA2026_RA-XXVI", numero: 26, nome: "Sobradinho Ii", nome_fonte: "SOBRADINHO II", area_km2: 181.3521 },
  { codigo: "RA_27", codigo_romano: "RA-XXVII", codigo_legado: "RA2026_RA-XXVII", numero: 27, nome: "Jardim Botânico", nome_fonte: "JARDIM BOTÂNICO", area_km2: 291.4276 },
  { codigo: "RA_28", codigo_romano: "RA-XXVIII", codigo_legado: "RA2026_RA-XXVIII", numero: 28, nome: "Itapoã", nome_fonte: "ITAPOÃ", area_km2: 34.3016 },
  { codigo: "RA_29", codigo_romano: "RA-XXIX", codigo_legado: "RA2026_RA-XXIX", numero: 29, nome: "SIA", nome_fonte: "SIA", area_km2: 29.0509 },
  { codigo: "RA_30", codigo_romano: "RA-XXX", codigo_legado: "RA2026_RA-XXX", numero: 30, nome: "Vicente Pires", nome_fonte: "VICENTE PIRES", area_km2: 42.878 },
  { codigo: "RA_31", codigo_romano: "RA-XXXI", codigo_legado: "RA2026_RA-XXXI", numero: 31, nome: "Fercal", nome_fonte: "FERCAL", area_km2: 154.38 },
  { codigo: "RA_32", codigo_romano: "RA-XXXII", codigo_legado: "RA2026_RA-XXXII", numero: 32, nome: "Sol Nascente e Por do Sol", nome_fonte: "SOL NASCENTE E POR DO SOL", area_km2: 40.4917 },
  { codigo: "RA_33", codigo_romano: "RA-XXXIII", codigo_legado: "RA2026_RA-XXXIII", numero: 33, nome: "Arniqueira", nome_fonte: "ARNIQUEIRA", area_km2: 13.3585 },
  { codigo: "RA_34", codigo_romano: "RA-XXXIV", codigo_legado: "RA2026_RA-XXXIV", numero: 34, nome: "Arapoanga", nome_fonte: "ARAPOANGA", area_km2: 21.9858 },
  { codigo: "RA_35", codigo_romano: "RA-XXXV", codigo_legado: "RA2026_RA-XXXV", numero: 35, nome: "Agua Quente", nome_fonte: "AGUA QUENTE", area_km2: 9.5121 },
  { codigo: "RA_36", codigo_romano: "RA-XXXVI", codigo_legado: "RA2026_RA-XXXVI", numero: 36, nome: "26 de Setembro", nome_fonte: "26 DE SETEMBRO", area_km2: 13.8936 },
  { codigo: "RA_37", codigo_romano: "RA-XXXVII", codigo_legado: "RA2026_RA-XXXVII", numero: 37, nome: "Ponte Alta", nome_fonte: "PONTE ALTA", area_km2: 54.9162 },
];
