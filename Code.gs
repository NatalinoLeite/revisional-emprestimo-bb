/**
 * @file Code.gs
 * @description Rotas principais do Web App Google Apps Script, controle de permissões e endpoints de API.
 */

/**
 * Ponto de entrada do Web App (HTTP GET).
 * Renderiza o Shell da aplicação e valida permissões de acesso do usuário ativo.
 */
function doGet(e) {
  try {
    // 1. Verificação de permissões do usuário
    const usuario = obterUsuarioAtual();
    if (!usuario.autorizado) {
      return HtmlService.createHtmlOutput(
        "<div style='font-family:sans-serif; text-align:center; padding:50px;'>" +
        "<h2>Acesso Não Autorizado</h2>" +
        "<p>O e-mail <b>" + usuario.email + "</b> não possui permissão ativa para acessar o Módulo Revisional.</p>" +
        "<p>Solicite a liberação do seu perfil na aba <i>Usuarios</i> da planilha.</p>" +
        "</div>"
      ).setTitle("Acesso Não Autorizado - Módulo Revisional");
    }

    // 2. Renderização do Template HTML
    const template = HtmlService.createTemplateFromFile("index");
    template.usuario = usuario;
    template.abaAtiva = e && e.parameter && e.parameter.aba ? e.parameter.aba : "wizard";

    return template.evaluate()
      .setTitle("Revisional de Empréstimos Bancários | Escritório de Advocacia")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  } catch (erro) {
    return HtmlService.createHtmlOutput(
      "<div style='font-family:sans-serif; padding:30px; color:#b91c1c;'>" +
      "<h3>Erro ao carregar o sistema:</h3><pre>" + erro.message + "</pre></div>"
    );
  }
}

/**
 * Função utilitária para incluir arquivos parciais de HTML/CSS/JS nos templates do Apps Script.
 * @param {string} filename - Nome do arquivo HTML (sem extensão .html).
 * @returns {string} Conteúdo HTML avaliado.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Obtém os dados do usuário autenticado e verifica seu perfil na aba Usuarios.
 * @returns {Object} { email, nome, perfil, autorizado }
 */
function obterUsuarioAtual() {
  const emailAtivo = Session.getActiveUser().getEmail();
  
  // Se não houver email identificado (ex.: execução anônima local), libera em modo dev
  if (!emailAtivo) {
    return {
      email: "advogado@escritorio.adv.br",
      nome: "Advogado Operador",
      perfil: "Advogado",
      autorizado: true
    };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    return { email: emailAtivo, nome: "Usuário", perfil: "Administrador", autorizado: true };
  }

  const sheet = ss.getSheetByName("Usuarios");
  if (!sheet || sheet.getLastRow() <= 1) {
    // Se a aba estiver vazia ou não existir, o primeiro usuário ganha acesso de administrador
    return { email: emailAtivo, nome: "Administrador", perfil: "Administrador", autorizado: true };
  }

  const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  for (let i = 0; i < dados.length; i++) {
    const emailLinha = String(dados[i][0] || "").toLowerCase().trim();
    if (emailLinha === emailAtivo.toLowerCase().trim()) {
      const nome = dados[i][1] || "Operador";
      const perfil = dados[i][2] || "Advogado";
      const ativo = dados[i][3] === true || String(dados[i][3]).toLowerCase() === "true" || dados[i][3] === 1;
      return {
        email: emailAtivo,
        nome: nome,
        perfil: perfil,
        autorizado: ativo
      };
    }
  }

  return { email: emailAtivo, nome: "Usuário Não Cadastrado", perfil: "Sem Acesso", autorizado: false };
}

/**
 * Pesquisa clientes e processos nas abas existentes para o Passo 1 do Wizard.
 * @param {string} termo - Texto de busca (nome, CPF ou número do processo).
 * @returns {Object} { clientes: Array, processos: Array }
 */
function buscarClientesEProcessos(termo) {
  const termoNorm = normalizarTexto(termo || "");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return { clientes: [], processos: [] };

  const clientesEncontrados = [];
  const processosEncontrados = [];

  // 1. Busca na aba Clientes
  const sheetClientes = ss.getSheetByName("Clientes");
  if (sheetClientes && sheetClientes.getLastRow() > 1) {
    const dados = sheetClientes.getRange(2, 1, sheetClientes.getLastRow() - 1, 7).getValues();
    dados.forEach(function(r) {
      const id = String(r[0] || "");
      const nome = String(r[1] || "");
      const cpf = String(r[2] || "");
      const email = String(r[3] || "");
      const renda = Number(r[5]) || 0;

      const textoLinha = normalizarTexto(id + " " + nome + " " + cpf + " " + email);
      if (!termoNorm || textoLinha.includes(termoNorm)) {
        clientesEncontrados.push({
          id: id,
          nome: nome,
          cpfCnpj: cpf,
          email: email,
          rendaDeclarada: renda
        });
      }
    });
  }

  // 2. Busca na aba Processos
  const sheetProcessos = ss.getSheetByName("Processos");
  if (sheetProcessos && sheetProcessos.getLastRow() > 1) {
    const dadosProc = sheetProcessos.getRange(2, 1, sheetProcessos.getLastRow() - 1, 8).getValues();
    dadosProc.forEach(function(r) {
      const id = String(r[0] || "");
      const clienteId = String(r[1] || "");
      const numero = String(r[2] || "");
      const tribunal = String(r[3] || "");
      const banco = String(r[5] || "");

      const textoLinha = normalizarTexto(id + " " + clienteId + " " + numero + " " + tribunal + " " + banco);
      if (!termoNorm || textoLinha.includes(termoNorm)) {
        processosEncontrados.push({
          id: id,
          clienteId: clienteId,
          numeroProcesso: numero,
          tribunal: tribunal,
          banco: banco
        });
      }
    });
  }

  return {
    clientes: clientesEncontrados.slice(0, 15),
    processos: processosEncontrados.slice(0, 15)
  };
}

/**
 * Endpoint de API chamado pelo frontend para upload do contrato e extração com IA (Passo 2).
 * 
 * @param {Object} payload
 * @param {string} payload.arquivoBase64 - Dados do arquivo em base64.
 * @param {string} payload.nomeArquivo - Nome original do arquivo.
 * @param {string} payload.mimeType - Tipo MIME.
 * @param {string} [payload.clienteNome] - Nome do cliente para pasta no Drive.
 * @returns {Object} Resultado da extração com dados higienizados e metadados do Drive.
 */
function apiUploadEExtrairContrato(payload) {
  try {
    // 1. Salva arquivo no Google Drive
    const infoArquivo = salvarContratoNoDrive(
      payload.arquivoBase64,
      payload.nomeArquivo,
      payload.mimeType,
      payload.clienteNome
    );

    // 2. Extrai dados via Gemini API
    const extracao = extrairDadosContratoComIA(payload.arquivoBase64, payload.mimeType);

    return {
      sucesso: true,
      arquivoDrive: infoArquivo,
      dadosExtraidos: extracao.dados,
      alertas: extracao.alertas
    };
  } catch (erro) {
    Logger.log("Erro no upload/extração: " + erro.message);
    return {
      sucesso: false,
      mensagem: "Falha na extração de dados do contrato: " + erro.message
    };
  }
}

/**
 * Endpoint de API para consulta de taxas do Banco Central para o formulário (Passo 3).
 * 
 * @param {Object} params
 * @returns {Object} Taxas apuradas.
 */
function apiConsultarTaxasBCB(params) {
  try {
    const resultado = consultarTaxasBancoCentral(params);
    return {
      sucesso: true,
      dados: resultado
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: erro.message
    };
  }
}

/**
 * Endpoint de API que executa o recálculo determinístico do contrato (Passo 4).
 * REGRA CENTRAL: Cálculo 100% determinístico e auditável através de motor.gs.
 * 
 * @param {Object} params - Dados confirmados pelo advogado no formulário.
 * @returns {Object} Resultado com todos os cenários e semáforo.
 */
function apiExecutarCalculoRevisional(params) {
  try {
    // Carrega configurações da aba ConfigRevisional
    const configs = obterConfiguracoesRevisional();
    params.config = configs;

    const resultado = calcularRevisionalCompleta(params);

    return {
      sucesso: true,
      resultado: resultado
    };
  } catch (erro) {
    Logger.log("Erro no recálculo: " + erro.message);
    return {
      sucesso: false,
      mensagem: erro.message
    };
  }
}

/**
 * Salva a revisional concluída na aba Revisionais e vincula ao Processo (Passo 4).
 * 
 * @param {Object} dados - Dados consolidados do contrato e resultado do cálculo.
 * @returns {Object} { sucesso, idRevisional }
 */
function apiSalvarRevisional(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Planilha não disponível.");
    const sheet = ss.getSheetByName("Revisionais");
    if (!sheet) throw new Error("Aba Revisionais não encontrada. Execute setupRevisional().");

    const usuario = obterUsuarioAtual();
    const idRevisional = "REV-" + Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyyMMdd-HHmmss");

    const linha = [
      idRevisional,
      dados.clienteId || "",
      dados.processoId || "",
      dados.dataContrato || "",
      dados.banco || "BCO DO BRASIL S.A.",
      dados.modalidade || "Crédito pessoal não consignado - Prefixado",
      Number(dados.valorLiberado) || 0,
      Number(dados.prazo) || 0,
      Number(dados.valorParcela) || 0,
      Number(dados.taxaMensalContrato) || 0,
      Number(dados.taxaAnualContrato) || 0,
      Number(dados.cet) || 0,
      Number(dados.iof) || 0,
      Number(dados.tarifas) || 0,
      Number(dados.seguro) || 0,
      dados.dataPrimeiraParcela || "",
      Number(dados.parcelasPagas) || 0,
      Number(dados.saldoDevedor) || 0,
      Number(dados.rendaLiquida) || 0,
      dados.resultado ? dados.resultado.semaforo.cor : "CALCULADO",
      JSON.stringify(dados.resultado || {}),
      new Date().toISOString(),
      usuario.email
    ];

    sheet.appendRow(linha);

    return {
      sucesso: true,
      idRevisional: idRevisional,
      mensagem: "Revisional salva com sucesso na aba Revisionais."
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: "Erro ao salvar revisional: " + erro.message
    };
  }
}
