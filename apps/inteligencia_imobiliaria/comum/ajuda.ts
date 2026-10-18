/**
 * "Como ler" de cada tela (spec 10.1, D-77): o que o número é, de onde vem e o
 * que ele não diz. Texto da app, versionado com o comportamento da tela.
 */
export const COMO_LER: Record<string, { titulo: string; texto: string }> = {
  operacao: {
    titulo: 'Como ler a Operação',
    texto: [
      'Importações: cada CSV entra em dois passos. A prévia lê e valida o arquivo inteiro sem gravar nada; o aplicar grava as linhas válidas em lotes de 500.',
      'A contagem sempre fecha: inseridas + atualizadas + ignoradas + rejeitadas = linhas do arquivo. Toda rejeição tem linha, coluna e motivo.',
      '"Ignorar" pula o registro que já existe pela chave natural (código, id antigo); "Atualizar" grava só as colunas presentes no CSV.',
      'Desfazer (só admin) remove para a lixeira as linhas que a importação criou e que ninguém editou depois; nunca apaga de vez.',
      'Qualidade: avisos que a importação ou a validação encontraram sem rejeitar a linha (ex.: faixas etárias que não somam 100%). Resolver registra quem e quando.',
    ].join('\n\n'),
  },
  cadastro: {
    titulo: 'Como ler o Cadastro',
    texto: [
      'Cada aba é uma tabela da pesquisa: anúncios, lançamentos, âncoras, contornos e localidades. O núcleo imobiliário (lotes, matrículas) não é copiado aqui: é ligado por vínculo e lido ao vivo.',
      'Editar exige a versão que você abriu: se outra pessoa salvou antes, a tela avisa em vez de sobrescrever.',
      'Remover é lógico: o registro vai para a lixeira da Config e pode ser restaurado. Todo criar, editar, remover e restaurar fica no histórico do registro.',
      '"Baixar CSV" exporta o filtro em tela; "Importar CSV" abre a importação já com a tabela desta aba.',
    ].join('\n\n'),
  },
  mapa: {
    titulo: 'Como ler o Mapa',
    texto: [
      'Pontos sem coordenada exata aparecem perto do centro da localidade e entram na contagem "sem coordenada exata": não servem para medir distância.',
      'Os KPIs valem para o filtro em tela. Mediana só com 5 anúncios ou mais; P25 e P75 só com 10 ou mais — abaixo disso o número não aparece.',
      'Preço/m² usa o informado pelo portal quando existe; divergência acima de 5% do calculado vira aviso, não correção.',
    ].join('\n\n'),
  },
  mercado: {
    titulo: 'Como ler o Mercado',
    texto: [
      'IVV (Índice de Velocidade de Vendas) = unidades vendidas no mês ÷ unidades ofertadas. O publicado pela fonte vence o recalculado; a diferença aparece como aviso.',
      'FipeZap é o preço médio anunciado por m², por localidade. Não é preço de transação.',
      'Toda série mostra a fonte e a data da publicação.',
    ].join('\n\n'),
  },
  diagnostico: {
    titulo: 'Como ler o Diagnóstico',
    texto: [
      'Os indicadores vêm da PDAD (Pesquisa Distrital por Amostra de Domicílios). São estimativas amostrais: localidade com amostra pequena tem coeficiente de variação alto e aparece com aviso de cautela.',
      'Percentuais são mostrados em %, mas guardados como fração.',
      'A Base de dados lista cada fonte importada, com período e procedência.',
    ].join('\n\n'),
  },
  estudos: {
    titulo: 'Como ler os Estudos de área',
    texto: [
      'Uma área de estudo é um recorte desenhado ou importado (KMZ), com tipo, estágio e responsável. Áreas próprias só aparecem para quem tem o papel estratégico, curador ou é o responsável.',
      'O bloco Núcleo mostra os registros do cadastro imobiliário ligados à área, lidos ao vivo. O bloco Atributos mostra os parâmetros da pesquisa.',
      'Mudar o estágio para iniciativa ou além, ou encerrar, exige o papel decisor e um motivo.',
    ].join('\n\n'),
  },
};
