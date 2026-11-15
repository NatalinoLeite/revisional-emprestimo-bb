/**
 * @file setup.gs
 * @description Funções idempotentes de configuração e inicialização das abas na Planilha Google.
 */

/**
 * Executa o setup completo das abas do sistema na Planilha ativa.
 * É 100% idempotente: cria as abas que não existem e preserva dados pré-existentes.
 * @returns {Object} Resumo das abas configuradas.
 */
function setupRevisional() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("Nenhuma planilha ativa encontrada. O script deve ser vinculado a uma Planilha Google.");
  }

  const abasCriadas = [];
  const abasAtualizadas = [];

  // 1. Aba Revisionais
  const cabecalhosRevisionais = [
    "id",
    "clienteId",
    "processoId",
    "dataContrato",
    "banco",
    "modalidade",
    "valorLiberado",
    "prazo",
    "valorParcela",
    "taxaMensalContrato",
    "taxaAnualContrato",
    "cet",
    "iof",
    "tarifas",
    "seguro",
    "dataPrimeiraParcela",
    "parcelasPagas",
    "saldoDevedor",
    "rendaLiquida",
    "status",
    "resultadoJSON",
    "criadoEm",
    "criadoPor"
  ];
  configurarAba(ss, "Revisionais", cabecalhosRevisionais, abasCriadas, abasAtualizadas);

  // 2. Aba TaxasBCB (Cache com TTL)
  const cabecalhosTaxasBCB = [
    "chave",
    "tipo",
    "modalidade",
    "instituicao",
    "anoMes",
    "taxaMensal",
    "taxaAnual",
    "posicao",
    "fonte",
    "buscadoEm",
    "expiraEm"
  ];
  configurarAba(ss, "TaxasBCB", cabecalhosTaxasBCB, abasCriadas, abasAtualizadas);

  // 3. Aba ConfigRevisional
  const cabecalhosConfig = ["chave", "valor", "descricao", "tipo"];
  const abaConfig = configurarAba(ss, "ConfigRevisional", cabecalhosConfig, abasCriadas, abasAtualizadas);
  popularConfiguracoesPadrao(abaConfig);

  // 4. Abas estruturais do ecossistema de advocacia (caso a planilha seja nova)
  configurarAba(ss, "Clientes", ["id", "nome", "cpfCnpj", "email", "telefone", "rendaDeclarada", "criadoEm"], abasCriadas, abasAtualizadas);
  configurarAba(ss, "Processos", ["id", "clienteId", "numeroProcesso", "tribunal", "vara", "banco", "status", "valorCausa", "criadoEm"], abasCriadas, abasAtualizadas);
  configurarAba(ss, "Usuarios", ["email", "nome", "perfil", "ativo", "criadoEm"], abasCriadas, abasAtualizadas);
  configurarAba(ss, "Atendimentos", ["id", "clienteId", "assunto", "status", "responsavel", "data"], abasCriadas, abasAtualizadas);
  configurarAba(ss, "Agendamentos", ["id", "clienteId", "dataHora", "tipo", "status", "observacoes"], abasCriadas, abasAtualizadas);

  // Garante usuário administrador padrão caso a aba Usuarios esteja vazia
  garantirUsuarioAdminPadrao(ss);

  const resultado = {
    sucesso: true,
    mensagem: "Setup executado com sucesso.",
    abasCriadas: abasCriadas,
    abasAtualizadas: abasAtualizadas,
    totalAbas: ss.getSheets().length
  };

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/**
 * Cria uma aba se ela não existir e formata a linha de cabeçalho.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Planilha ativa.
 * @param {string} nomeAba - Nome da aba.
 * @param {Array<string>} cabecalhos - Lista de nomes das colunas.
 * @param {Array<string>} abasCriadas - Array acumulador para relatório.
 * @param {Array<string>} abasAtualizadas - Array acumulador para relatório.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function configurarAba(ss, nomeAba, cabecalhos, abasCriadas, abasAtualizadas) {
  let sheet = ss.getSheetByName(nomeAba);
  if (!sheet) {
    sheet = ss.insertSheet(nomeAba);
    abasCriadas.push(nomeAba);
  } else {
    abasAtualizadas.push(nomeAba);
  }

  // Se a aba estiver vazia ou com cabeçalho diferente, aplica cabeçalhos
  const ultimaColuna = sheet.getLastColumn();
  if (ultimaColuna === 0) {
    sheet.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
    formatarLinhaCabecalho(sheet, cabecalhos.length);
  } else {
    const cabecalhoAtual = sheet.getRange(1, 1, 1, ultimaColuna).getValues()[0];
    if (cabecalhoAtual.length < cabecalhos.length) {
      sheet.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
      formatarLinhaCabecalho(sheet, cabecalhos.length);
    }
  }

  return sheet;
}

/**
 * Formata visualmente o cabeçalho da planilha (fundo azul marinho, texto branco, negrito, congelado).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} totalColunas
 */
function formatarLinhaCabecalho(sheet, totalColunas) {
  const headerRange = sheet.getRange(1, 1, 1, totalColunas);
  headerRange.setBackground("#1a365d");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

/**
 * Popula a aba ConfigRevisional com chaves e parâmetros padrão caso não existam.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function popularConfiguracoesPadrao(sheet) {
  const configsPadrao = [
    ["limite_verde_multiplicador", "2.0", "Multiplicador de abusividade grave para semáforo VERDE (ex.: 2.0x média)", "number"],
    ["limite_amarelo_multiplicador", "1.5", "Multiplicador de jurisprudência STJ para semáforo AMARELO (ex.: 1.5x média)", "number"],
    ["limiar_relevancia_reais", "3000.00", "Valor mínimo em R$ de proveito para classificar viabilidade expressiva", "number"],
    ["multiplicador_cenario_b", "1.0", "Multiplicador do Cenário B (taxa média de mercado)", "number"],
    ["multiplicador_cenario_c", "1.5", "Multiplicador do Cenário C (limite STJ)", "number"],
    ["multiplicador_cenario_d", "2.0", "Multiplicador do Cenário D (abusividade extrema)", "number"],
    ["indice_correcao_padrao", "IPCA", "Índice padrão de correção monetária (IPCA=433, INPC=188, Selic=4390)", "string"],
    ["codigo_sgs_indice_padrao", "433", "Código numérico do índice oficial no Banco Central SGS", "string"],
    ["juros_mora_mensal", "1.0", "Percentual mensal de juros de mora legais (% a.m.)", "number"],
    ["honorarios_contratuais_perc", "20.0", "Percentual padrão de honorários advocatícios contratuais (%)", "number"],
    ["honorarios_sucumbenciais_perc", "10.0", "Percentual estimado de honorários sucumbenciais (%)", "number"],
    ["comprometimento_renda_alerta", "30.0", "Percentual da renda líquida para emissão de alerta de comprometimento (%)", "number"],
    ["cache_bcb_ttl_dias", "30", "Tempo de vida útil (TTL) em dias para o cache de taxas do Banco Central", "number"],
    ["modalidade_olinda_padrao", "Crédito pessoal não consignado - Prefixado", "Nome exato da modalidade padrão na API Olinda do BCB", "string"],
    ["modalidade_codigo_olinda", "221101", "Código da modalidade na API Olinda de Taxas Diárias", "string"],
    ["serie_sgs_media_mensal", "25464", "Código da série SGS de taxa média de mercado mensal (% a.m.)", "string"],
    ["serie_sgs_media_anual", "20741", "Código da série SGS de taxa média de mercado anual (% a.a.)", "string"],
    ["instituicao_padrao", "BCO DO BRASIL S.A.", "Nome cadastrado da instituição no Banco Central para BB Crédito Salário", "string"]
  ];

  const ultimaLinha = sheet.getLastRow();
  let mapaExistente = {};

  if (ultimaLinha > 1) {
    const dados = sheet.getRange(2, 1, ultimaLinha - 1, 1).getValues();
    dados.forEach(function(r) {
      if (r[0]) mapaExistente[String(r[0]).trim()] = true;
    });
  }

  const novasLinhas = [];
  configsPadrao.forEach(function(item) {
    if (!mapaExistente[item[0]]) {
      novasLinhas.push(item);
    }
  });

  if (novasLinhas.length > 0) {
    sheet.getRange(ultimaLinha + 1, 1, novasLinhas.length, 4).setValues(novasLinhas);
  }
}

/**
 * Garante que exista pelo menos um usuário administrador inicial se a aba Usuarios estiver vazia.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 */
function garantirUsuarioAdminPadrao(ss) {
  const sheet = ss.getSheetByName("Usuarios");
  if (!sheet) return;

  if (sheet.getLastRow() <= 1) {
    const emailAtivo = Session.getActiveUser().getEmail() || "admin@escritorio.adv.br";
    sheet.appendRow([
      emailAtivo,
      "Administrador",
      "Administrador",
      true,
      new Date().toISOString()
    ]);
  }
}

/**
 * Lê todas as configurações da aba ConfigRevisional retornando um objeto associativo chave -> valor.
 * @returns {Object} Mapa de configurações.
 */
function obterConfiguracoesRevisional() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return {};
  const sheet = ss.getSheetByName("ConfigRevisional");
  if (!sheet) return {};

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha <= 1) return {};

  const dados = sheet.getRange(2, 1, ultimaLinha - 1, 4).getValues();
  const configs = {};

  dados.forEach(function(linha) {
    const chave = String(linha[0] || "").trim();
    const valorStr = String(linha[1] || "").trim();
    const tipo = String(linha[3] || "").toLowerCase().trim();

    if (!chave) return;

    if (tipo === "number") {
      configs[chave] = parseFloat(valorStr) || 0;
    } else if (tipo === "boolean") {
      configs[chave] = valorStr.toLowerCase() === "true" || valorStr === "1";
    } else {
      configs[chave] = valorStr;
    }
  });

  return configs;
}
