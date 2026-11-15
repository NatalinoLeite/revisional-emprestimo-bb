/**
 * @file relatorio.gs
 * @description Módulo de geração de relatórios periciais de triagem em formato PDF via Google Docs e Drive.
 */

// Fallback para Logger fora do GAS
var Logger = typeof Logger !== "undefined" ? Logger : {
  log: function() {
    if (typeof console !== "undefined") console.log.apply(console, arguments);
  }
};

/**
 * Endpoint de API chamado pelo frontend para gerar o relatório pericial em PDF.
 * @param {Object} payload - { cliente, dadosContrato, resultado, idRevisional }
 * @returns {Object} { sucesso, pdfUrl, fileId, mensagem }
 */
function apiGerarRelatorioPDF(payload) {
  try {
    const res = gerarRelatorioRevisionalPDF(payload);
    
    // Se houver idRevisional informado, atualiza o link na aba Revisionais
    if (payload.idRevisional && res.pdfUrl) {
      vincularRelatorioNaPlanilha(payload.idRevisional, res.pdfUrl);
    }

    return {
      sucesso: true,
      pdfUrl: res.pdfUrl,
      fileId: res.fileId,
      mensagem: "Relatório gerado com sucesso."
    };
  } catch (erro) {
    Logger.log("Erro ao gerar relatório PDF: " + erro.message);
    return {
      sucesso: false,
      mensagem: "Falha na geração do relatório: " + erro.message
    };
  }
}

/**
 * Gera um documento estruturado no Google Docs, popula com os dados analíticos
 * do recálculo determinístico e converte em arquivo PDF no Google Drive.
 * 
 * @param {Object} payload - Contém dados do cliente, contrato e resultado do cálculo financeiro.
 * @returns {Object} { pdfUrl, fileId, nomeArquivo }
 */
function gerarRelatorioRevisionalPDF(payload) {
  const cliente = payload.cliente || {};
  const dc = payload.dadosContrato || {};
  const res = payload.resultado || {};
  const sem = res.semaforo || {};
  const cenarios = res.cenarios || {};

  const nomeCliente = cliente.nome || "Cliente";
  const dataHojeFormatada = formatarDataBR(new Date());
  const nomeArquivo = "Relatório Revisional - " + nomeCliente.replace(/[\\/:*?"<>|]/g, "_") + " - " + dataHojeFormatada.replace(/\//g, "-");

  // Caso esteja em ambiente de teste ou fora do Google Apps Script
  if (typeof DocumentApp === "undefined" || typeof DriveApp === "undefined") {
    return {
      pdfUrl: "https://drive.google.com/file/d/mock_relatorio_revisional/view",
      fileId: "mock_relatorio_revisional",
      nomeArquivo: nomeArquivo + ".pdf"
    };
  }

  // 1. Criação do Google Doc temporário
  const doc = DocumentApp.create(nomeArquivo);
  const body = doc.getBody();

  // Estilos tipográficos
  body.setMarginTop(40);
  body.setMarginBottom(40);
  body.setMarginLeft(50);
  body.setMarginRight(50);

  // 2. Cabeçalho Institucional
  const pTitulo = body.appendParagraph("PARECER CONTÁBIL-JURÍDICO PRELIMINAR");
  pTitulo.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  pTitulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pTitulo.getAttributes()[DocumentApp.Attribute.FOREGROUND_COLOR] = "#1e3a8a";

  const pSubtitulo = body.appendParagraph("Análise Pericial Revisional de Empréstimo Bancário | Triagem Técnica");
  pSubtitulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pSubtitulo.setItalic(true);

  body.appendHorizontalRule();

  // 3. Seção 1: Identificação das Partes e do Contrato
  const s1 = body.appendParagraph("1. DADOS DA OPERAÇÃO E DAS PARTES");
  s1.setHeading(DocumentApp.ParagraphHeading.HEADING2);

  const tabelaDados = body.appendTable([
    ["Cliente / Mutuário:", nomeCliente, "CPF / CNPJ:", mascararDocumento(cliente.cpf || "")],
    ["Instituição Financeira:", dc.banco || "Banco do Brasil S.A.", "Modalidade:", dc.modalidade || "Crédito pessoal"],
    ["Nº da Operação:", dc.numeroContrato || "Não informado", "Processo Judicial:", cliente.numeroProcesso || "Fase Pré-processual"],
    ["Data da Contratação:", formatarDataBR(dc.dataContrato), "Primeiro Vencimento:", formatarDataBR(dc.dataPrimeiraParcela)],
    ["Valor Liberado (Líquido):", formatarMoeda(dc.valorLiberado), "Prazo Total:", (dc.prazo || 0) + " parcelas mensais"],
    ["Parcela Atual Cobrada:", formatarMoeda(dc.valorParcela), "Parcelas Quitadas:", (dc.parcelasPagas || 0) + " parcelas"]
  ]);
  formatarTabela(tabelaDados, "#f8fafc", "#e2e8f0");

  body.appendParagraph("");

  // 4. Seção 2: Confronto com as Taxas Oficiais do Banco Central
  const s2 = body.appendParagraph("2. CONFRONTO DE TAXAS COM O BANCO CENTRAL DO BRASIL");
  s2.setHeading(DocumentApp.ParagraphHeading.HEADING2);

  const txContrato = dc.taxaImplicitaMensal || dc.taxaMensalContrato || 0;
  const txMercado = dc.taxaMediaBCBMensal || 0;
  const razao = dc.razaoTaxaMercado || (txMercado > 0 ? txContrato / txMercado : 1.0);

  const tabelaTaxas = body.appendTable([
    ["Indicador", "Taxa Mensal (% a.m.)", "Taxa Anual Equivalente (% a.a.)", "Fonte Oficial / Referência"],
    ["Taxa Efetiva Implícita do Contrato", txContrato.toFixed(2) + "%", taxaMensalParaAnual(txContrato).toFixed(2) + "%", "Calculada via equivalência financeira (Price)"],
    ["Taxa Média de Mercado (BACEN)", txMercado.toFixed(2) + "%", taxaMensalParaAnual(txMercado).toFixed(2) + "%", "Banco Central do Brasil - SGS Série 25464"],
    ["Disparidade Contrato / Média", razao.toFixed(2) + "x a média", "-", "Critério Jurisprudencial STJ"]
  ]);
  formatarTabela(tabelaTaxas, "#f1f5f9", "#cbd5e1");

  body.appendParagraph("");

  // 5. Seção 3: Quadro Comparativo dos Cenários de Recálculo
  const s3 = body.appendParagraph("3. CENÁRIOS DETERMINÍSTICOS DE RECÁLCULO");
  s3.setHeading(DocumentApp.ParagraphHeading.HEADING2);

  const cOrig = cenarios.A || {};
  const cB = cenarios.B || {};
  const cC = cenarios.C || {};
  const cD = cenarios.D || {};
  const cE = cenarios.E || {};

  const linhasCenarios = [
    ["Cenário Analisado", "Taxa (% a.m.)", "Nova Parcela", "Redução Mensal", "Restituição (Pagas)", "Proveito Econômico Total", "Líquido Cliente"]
  ];

  function adicionarLinhaCenario(cen, label) {
    if (!cen || !cen.novaParcela) return;
    linhasCenarios.push([
      label,
      cen.taxaAplicadaMensal.toFixed(2) + "%",
      formatarMoeda(cen.novaParcela),
      "-" + formatarMoeda(cen.reducaoParcela),
      formatarMoeda(cen.indebitoAplicado),
      formatarMoeda(cen.proveitoTotalEstimado),
      formatarMoeda(cen.liquidoCliente)
    ]);
  }

  adicionarLinhaCenario(cOrig, "A) Original (Como pactuado)");
  adicionarLinhaCenario(cB, "B) Taxa Média (1,0x BACEN)");
  adicionarLinhaCenario(cC, "C) Limite STJ (1,5x BACEN)*");
  adicionarLinhaCenario(cD, "D) Abusividade Qualificada (2,0x)");
  adicionarLinhaCenario(cE, "E) Expurgo de Tarifas/Seguro");

  const tabelaCenarios = body.appendTable(linhasCenarios);
  formatarTabela(tabelaCenarios, "#f8fafc", "#e2e8f0");

  const notaC = body.appendParagraph("* O Cenário C reflete a orientação predominante no Superior Tribunal de Justiça (STJ), que autoriza a revisão quando os juros superam 1,5x a taxa média de mercado divulgada pelo BACEN.");
  notaC.setFontSize(8.5);
  notaC.setItalic(true);

  body.appendParagraph("");

  // 6. Seção 4: Conclusão do Semáforo e Parecer Preliminar
  const s4 = body.appendParagraph("4. CONCLUSÃO DA TRIAGEM DE VIABILIDADE");
  s4.setHeading(DocumentApp.ParagraphHeading.HEADING2);

  const pSemaforo = body.appendParagraph("CLASSIFICAÇÃO: " + (sem.cor || "ANÁLISE") + " - " + (sem.titulo || ""));
  pSemaforo.setBold(true);
  if (sem.cor === "VERDE") pSemaforo.getAttributes()[DocumentApp.Attribute.FOREGROUND_COLOR] = "#059669";
  else if (sem.cor === "AMARELO") pSemaforo.getAttributes()[DocumentApp.Attribute.FOREGROUND_COLOR] = "#d97706";
  else pSemaforo.getAttributes()[DocumentApp.Attribute.FOREGROUND_COLOR] = "#dc2626";

  body.appendParagraph(sem.explicacao || "Análise preliminar realizada.");

  if (res.alertaComprometimento && res.alertaComprometimento.ultrapassouLimite) {
    const pRenda = body.appendParagraph("ALERTA DE SUPERENDIVIDAMENTO: A parcela consome " + res.alertaComprometimento.percentualComprometimento.toFixed(1) + "% da renda declarada, recomendando-se pedido subsidiário com base na Lei 14.181/2021 (Lei do Superendividamento).");
    pRenda.setItalic(true);
    pRenda.getAttributes()[DocumentApp.Attribute.FOREGROUND_COLOR] = "#991b1b";
  }

  body.appendParagraph("");

  // 7. Aviso Legal Obrigatório
  const pAviso = body.appendParagraph("AVISO LEGAL OBRIGATÓRIO:\nEstimativa para triagem preliminar; não substitui perícia contábil forense nem constitui garantia de resultado judicial. As decisões variam conforme o entendimento específico da comarca e do tribunal competente.");
  pAviso.setFontSize(8);
  pAviso.setItalic(true);
  pAviso.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);

  body.appendParagraph("\nEmitido eletronicamente em " + dataHojeFormatada + " pelo Módulo Revisional de Empréstimos.");

  // Salva e fecha o Google Doc
  doc.saveAndClose();

  // 8. Conversão para PDF e Salvamento na pasta do Drive
  const pastaRelatorios = obterOuCriarPastaDrive("Relatórios Revisional");
  const blobPdf = doc.getAs("application/pdf");
  blobPdf.setName(nomeArquivo + ".pdf");
  const arquivoPdf = pastaRelatorios.createFile(blobPdf);

  // Opcional: remove o documento temporário do Docs para não poluir o Drive
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  return {
    sucesso: true,
    pdfUrl: arquivoPdf.getUrl(),
    fileId: arquivoPdf.getId(),
    nomeArquivo: arquivoPdf.getName()
  };
}

/**
 * Localiza ou cria uma pasta no Google Drive.
 * @param {string} nomePasta
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function obterOuCriarPastaDrive(nomePasta) {
  const pastas = DriveApp.getFoldersByName(nomePasta);
  if (pastas.hasNext()) {
    return pastas.next();
  }
  return DriveApp.createFolder(nomePasta);
}

/**
 * Formata visualmente uma tabela no Google Docs.
 * @param {GoogleAppsScript.Document.Table} tabela
 * @param {string} corFundoCabecalho
 * @param {string} corBorda
 */
function formatarTabela(tabela, corFundoCabecalho, corBorda) {
  tabela.setBorderColor(corBorda || "#cbd5e1");
  const qtdLinhas = tabela.getNumRows();
  
  for (let r = 0; r < qtdLinhas; r++) {
    const linha = tabela.getRow(r);
    const qtdCelulas = linha.getNumCells();
    
    for (let c = 0; c < qtdCelulas; c++) {
      const celula = linha.getCell(c);
      celula.setPaddingTop(5);
      celula.setPaddingBottom(5);
      celula.setPaddingLeft(6);
      celula.setPaddingRight(6);
      
      if (r === 0) {
        celula.setBackgroundColor(corFundoCabecalho || "#e2e8f0");
        const p = celula.getChild(0);
        if (p && p.asParagraph) p.asParagraph().setBold(true);
      }
    }
  }
}

/**
 * Atualiza o link do PDF na aba Revisionais e na aba Processos.
 * @param {string} idRevisional
 * @param {string} pdfUrl
 */
function vincularRelatorioNaPlanilha(idRevisional, pdfUrl) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  const sheet = ss.getSheetByName("Revisionais");
  if (!sheet) return;

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha <= 1) return;

  const ids = sheet.getRange(2, 1, ultimaLinha - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === idRevisional) {
      // Salva na coluna 20 (status) ou cria nota
      sheet.getRange(i + 2, 20).setValue("PDF_GERADO");
      sheet.getRange(i + 2, 1).setNote("Relatório PDF: " + pdfUrl);
      break;
    }
  }
}

/**
 * Mascara CPF/CNPJ para relatórios (proteção de dados sensíveis).
 * Ex.: 123.456.789-00 -> 123.***.***-00
 * @param {string} doc
 * @returns {string}
 */
function mascararDocumento(doc) {
  if (!doc) return "Não informado";
  const limpo = String(doc).replace(/\D/g, "");
  if (limpo.length === 11) {
    return limpo.substring(0, 3) + ".***.***-" + limpo.substring(9);
  } else if (limpo.length === 14) {
    return limpo.substring(0, 2) + ".***.***/****-" + limpo.substring(12);
  }
  return doc;
}

/**
 * Formata data no formato brasileiro DD/MM/AAAA sem sofrer distorção de fuso horário (timezone offset).
 * @param {string|Date} d
 * @returns {string}
 */
function formatarDataBR(d) {
  if (!d) return "Não informado";
  if (typeof d === "string") {
    const s = d.trim();
    if (s.includes("/")) return s;
    if (s.includes("-")) {
      const p = s.split("-");
      if (p.length === 3) {
        return p[2].padStart(2, "0") + "/" + p[1].padStart(2, "0") + "/" + p[0];
      }
    }
  }
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const dia = String(dt.getDate()).padStart(2, "0");
  const mes = String(dt.getMonth() + 1).padStart(2, "0");
  const ano = dt.getFullYear();
  return dia + "/" + mes + "/" + ano;
}

/**
 * Formata moeda para Real brasileiro (R$).
 * @param {number} val
 * @returns {string}
 */
function formatarMoeda(val) {
  const n = Number(val) || 0;
  return "R$ " + n.toFixed(2).replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

// Exportação para testes locais
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    gerarRelatorioRevisionalPDF: gerarRelatorioRevisionalPDF,
    mascararDocumento: mascararDocumento,
    formatarDataBR: formatarDataBR,
    formatarMoeda: formatarMoeda
  };
}
