/**
 * @file bcb.gs
 * @description Módulo de integração com as APIs oficiais do Banco Central do Brasil (Olinda OData v2 e SGS Séries Temporais).
 * Inclui cache na planilha com TTL, retries com backoff exponencial e fallback manual.
 */

// Fallback para Logger e ambiente fora do Google Apps Script
var Logger = typeof Logger !== "undefined" ? Logger : {
  log: function() {
    if (typeof console !== "undefined") {
      console.log.apply(console, arguments);
    }
  }
};

// Se estiver em ambiente Node.js, importa módulos necessários para compatibilidade de testes locais
let fetchHttp;
if (typeof module !== "undefined" && typeof require !== "undefined") {
  fetchHttp = function(url) {
    const syncFetch = require("child_process").execFileSync;
    const pyScript = `
import urllib.request, ssl, sys
url = sys.argv[1]
ctx = ssl.create_default_context()
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, context=ctx) as r:
    sys.stdout.write(r.read().decode('utf-8'))
`;
    try {
      const output = syncFetch("python", ["-c", pyScript, url], {
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024
      });
      return {
        getResponseCode: () => 200,
        getContentText: () => output
      };
    } catch (e) {
      throw new Error("Erro na requisição HTTP: " + e.message);
    }
  };
}

/**
 * Consulta as taxas de referência para o contrato:
 * 1. Taxa média de mercado da modalidade (via SGS ou média Olinda)
 * 2. Taxa média praticada pelo Banco do Brasil (via Olinda)
 * 
 * @param {Object} params
 * @param {string} params.dataContrato - Data da contratação (YYYY-MM-DD ou DD/MM/YYYY).
 * @param {string} [params.modalidade] - Nome da modalidade (padrão: "Crédito pessoal não consignado - Prefixado").
 * @param {string} [params.instituicao] - Nome do banco (padrão: "BCO DO BRASIL S.A.").
 * @param {number} [params.fallbackTaxaManual] - Taxa mensal manual caso a API esteja fora do ar.
 * @returns {Object} Taxas apuradas com metadados de auditoria.
 */
function consultarTaxasBancoCentral(params) {
  const dataContratoISO = padronizarDataParaISO(params.dataContrato);
  if (!dataContratoISO) {
    throw new Error("Data do contrato inválida ou não informada.");
  }

  const modalidade = params.modalidade || "Crédito pessoal não consignado - Prefixado";
  const instituicao = params.instituicao || "BCO DO BRASIL S.A.";
  const anoMes = dataContratoISO.substring(0, 7); // YYYY-MM
  const chaveCache = "TAXA:" + modalidade + ":" + instituicao + ":" + anoMes;

  // 1. Tenta recuperar do cache persistente
  const cache = obterCacheTaxa(chaveCache);
  if (cache) {
    return {
      sucesso: true,
      origem: "CACHE",
      dataContrato: dataContratoISO,
      anoMes: anoMes,
      modalidade: modalidade,
      instituicao: instituicao,
      taxaMediaMercadoMensal: cache.taxaMediaMensal,
      taxaMediaMercadoAnual: cache.taxaMediaAnual,
      taxaBancoMensal: cache.taxaBancoMensal,
      taxaBancoAnual: cache.taxaBancoAnual,
      posicaoRankingBanco: cache.posicaoRanking,
      fonte: cache.fonte,
      buscadoEm: cache.buscadoEm
    };
  }

  // 2. Se o usuário forneceu fallback manual explícito e solicitou forçar manual
  if (params.usarManualApenas && params.fallbackTaxaManual !== undefined && params.fallbackTaxaManual > 0) {
    const txManualMensal = Number(params.fallbackTaxaManual);
    const txManualAnual = Math.pow(1 + txManualMensal / 100, 12) - 1;
    return {
      sucesso: true,
      origem: "MANUAL",
      dataContrato: dataContratoISO,
      anoMes: anoMes,
      modalidade: modalidade,
      instituicao: instituicao,
      taxaMediaMercadoMensal: txManualMensal,
      taxaMediaMercadoAnual: txManualAnual * 100,
      taxaBancoMensal: txManualMensal,
      taxaBancoAnual: txManualAnual * 100,
      posicaoRankingBanco: null,
      fonte: "Informada manualmente pelo usuário",
      buscadoEm: new Date().toISOString()
    };
  }

  let taxaMediaMensal = null;
  let taxaMediaAnual = null;
  let taxaBancoMensal = null;
  let taxaBancoAnual = null;
  let posicaoRanking = null;
  let fonte = "";

  // 3. Identifica a série oficial do SGS do Banco Central conforme a modalidade do contrato
  const infoSerie = obterCodigoSerieSGSPorModalidade(modalidade);
  try {
    const resultadoSGS = consultarTaxaMediaSGS(infoSerie.codigo, dataContratoISO);
    if (resultadoSGS && resultadoSGS.taxa !== null) {
      taxaMediaMensal = resultadoSGS.taxa;
      taxaMediaAnual = (Math.pow(1 + taxaMediaMensal / 100, 12) - 1) * 100;
      fonte = "Banco Central do Brasil - SGS Série " + infoSerie.codigo + " (" + infoSerie.nome + " - " + resultadoSGS.dataReferencia + ")";
    }
  } catch (erroSGS) {
    Logger.log("Aviso: Consulta SGS falhou. Tentando Olinda. Erro: " + erroSGS.message);
  }

  // 4. Consulta Taxa do Banco (ex.: BCO DO BRASIL S.A.) no Olinda Diário
  try {
    const resultadoOlinda = consultarTaxaOlindaDiaria(modalidade, instituicao, dataContratoISO);
    if (resultadoOlinda) {
      if (resultadoOlinda.taxaBanco) {
        taxaBancoMensal = resultadoOlinda.taxaBanco.TaxaJurosAoMes;
        taxaBancoAnual = resultadoOlinda.taxaBanco.TaxaJurosAoAno;
        posicaoRanking = resultadoOlinda.taxaBanco.Posicao;
      }
      
      // Se o SGS não tiver retornado a média, calcula a média de mercado das instituições no Olinda
      if (taxaMediaMensal === null && resultadoOlinda.mediaMercadoCalculada !== null) {
        taxaMediaMensal = resultadoOlinda.mediaMercadoCalculada;
        taxaMediaAnual = (Math.pow(1 + taxaMediaMensal / 100, 12) - 1) * 100;
        fonte = "Banco Central do Brasil - Olinda OData (Média apurada na amostra de " + resultadoOlinda.periodoReferencia + ")";
      }
    }
  } catch (erroOlinda) {
    Logger.log("Aviso: Consulta Olinda falhou. Erro: " + erroOlinda.message);
  }

  // 5. Se ambas falharam, recorrer ao fallback manual se disponível
  if (taxaMediaMensal === null) {
    if (params.fallbackTaxaManual !== undefined && params.fallbackTaxaManual > 0) {
      taxaMediaMensal = Number(params.fallbackTaxaManual);
      taxaMediaAnual = (Math.pow(1 + taxaMediaMensal / 100, 12) - 1) * 100;
      fonte = "Fallback manual (APIs do Banco Central temporariamente indisponíveis)";
    } else {
      throw new Error(
        "Não foi possível obter a taxa oficial do Banco Central para o período " + anoMes + 
        ". Verifique a conexão com a internet ou informe a taxa média manualmente no campo de fallback."
      );
    }
  }

  const resultadoFinal = {
    sucesso: true,
    origem: "API_BCB",
    dataContrato: dataContratoISO,
    anoMes: anoMes,
    modalidade: modalidade,
    instituicao: instituicao,
    taxaMediaMercadoMensal: taxaMediaMensal,
    taxaMediaMercadoAnual: taxaMediaAnual,
    taxaBancoMensal: taxaBancoMensal !== null ? taxaBancoMensal : taxaMediaMensal,
    taxaBancoAnual: taxaBancoAnual !== null ? taxaBancoAnual : taxaMediaAnual,
    posicaoRankingBanco: posicaoRanking,
    fonte: fonte || "Banco Central do Brasil (BACEN)",
    buscadoEm: new Date().toISOString()
  };

  // 6. Grava no cache persistente com TTL configurado
  salvarCacheTaxa(chaveCache, {
    modalidade: modalidade,
    instituicao: instituicao,
    anoMes: anoMes,
    taxaMediaMensal: resultadoFinal.taxaMediaMercadoMensal,
    taxaMediaAnual: resultadoFinal.taxaMediaMercadoAnual,
    taxaBancoMensal: resultadoFinal.taxaBancoMensal,
    taxaBancoAnual: resultadoFinal.taxaBancoAnual,
    posicaoRanking: resultadoFinal.posicaoRankingBanco,
    fonte: resultadoFinal.fonte
  });

  return resultadoFinal;
}

/**
 * Mapeia o título ou nome da modalidade para a série temporal oficial do SGS/BACEN correspondente.
 * 
 * - Série 25469: Taxa média mensal - Crédito consignado para trabalhadores do setor privado (CLT)
 * - Série 25467: Taxa média mensal - Crédito consignado para servidores públicos
 * - Série 25468: Taxa média mensal - Crédito consignado para aposentados e pensionistas do INSS
 * - Série 25471: Taxa média mensal - Financiamento de veículos
 * - Série 25464: Taxa média mensal - Crédito pessoal não consignado (padrão)
 * 
 * @param {string} modalidade
 * @returns {Object} { codigo, nome }
 */
function obterCodigoSerieSGSPorModalidade(modalidade) {
  const mod = String(modalidade || "").toLowerCase().trim();

  if (mod.includes("privad") || mod.includes("clt") || mod.includes("trabalhador") || mod.includes("setor privado")) {
    return { codigo: "25469", nome: "Crédito consignado privado (CLT)" };
  }
  if (mod.includes("inss") || mod.includes("aposentad") || mod.includes("pensionist") || mod.includes("beneficiári")) {
    return { codigo: "25468", nome: "Crédito consignado INSS" };
  }
  if (mod.includes("públic") || mod.includes("public") || mod.includes("servidor") || mod.includes("governo")) {
    return { codigo: "25467", nome: "Crédito consignado público" };
  }
  if (mod.includes("veícul") || mod.includes("veicul") || mod.includes("auto") || mod.includes("carro") || mod.includes("moto")) {
    return { codigo: "25471", nome: "Financiamento de veículos" };
  }

  // Padrão: Crédito pessoal não consignado
  return { codigo: "25464", nome: "Crédito pessoal não consignado" };
}

/**
 * Consulta a taxa média mensal de mercado no Sistema Gerenciador de Séries Temporais (SGS) do BCB.
 * Utiliza o dia 01/MM/AAAA para consultar diretamente a taxa oficial vigente naquele mês.
 * 
 * @param {string} codigoSerie - Código numérico da série no SGS (ex.: 25464 ou 25469).
 * @param {string} dataISO - Data no formato YYYY-MM-DD.
 * @returns {Object} { taxa, dataReferencia }
 */
function consultarTaxaMediaSGS(codigoSerie, dataISO) {
  const partes = dataISO.split("-");
  const ano = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10);
  const mesFormatado = String(mes).padStart(2, "0");

  // 1. Tenta consulta direta com dataInicial e dataFinal = 01/MM/AAAA (padrão de publicação mensal do SGS)
  const dtExata = "01/" + mesFormatado + "/" + ano;
  const urlExata = "https://api.bcb.gov.br/dados/serie/bcdata.sgs." + codigoSerie + "/dados?formato=json&dataInicial=" + dtExata + "&dataFinal=" + dtExata;

  try {
    const respExata = executarHttpComRetry(urlExata, 2);
    if (respExata) {
      const dadosExatos = JSON.parse(respExata);
      if (Array.isArray(dadosExatos) && dadosExatos.length > 0 && dadosExatos[0].valor) {
        return {
          taxa: parseFloat(String(dadosExatos[0].valor).replace(",", ".")),
          dataReferencia: dadosExatos[0].data
        };
      }
    }
  } catch (e) {
    // Continua para a janela ampliada se a consulta pontual falhar
  }

  // 2. Busca janela de 3 meses ao redor da data para garantir retorno mesmo se o dia exato não tiver publicação
  const mesInicio = Math.max(1, mes - 1);
  const mesFim = Math.min(12, mes + 1);
  const dtInicio = "01/" + String(mesInicio).padStart(2, "0") + "/" + ano;
  const dtFim = "28/" + String(mesFim).padStart(2, "0") + "/" + ano;

  const url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs." + codigoSerie + "/dados?formato=json&dataInicial=" + dtInicio + "&dataFinal=" + dtFim;
  
  const respostaJson = executarHttpComRetry(url, 3);
  if (!respostaJson) return null;

  const dados = JSON.parse(respostaJson);
  if (!Array.isArray(dados) || dados.length === 0) return null;

  // Procura pelo mês exato (formato no SGS: "01/MM/YYYY")
  const mesAlvoStr = String(mes).padStart(2, "0") + "/" + ano;
  let registroEncontrado = dados.find(function(item) {
    return item.data && item.data.endsWith(mesAlvoStr);
  });

  // Se não encontrar o mês exato, pega o mais próximo
  if (!registroEncontrado) {
    registroEncontrado = dados[dados.length - 1];
  }

  if (registroEncontrado && registroEncontrado.valor) {
    const valorNum = parseFloat(String(registroEncontrado.valor).replace(",", "."));
    return {
      taxa: valorNum,
      dataReferencia: registroEncontrado.data
    };
  }

  return null;
}

/**
 * Consulta as taxas de juros no endpoint OData Olinda do Banco Central:
 * TaxasJurosDiariaPorInicioPeriodo (que contém o ranking de todas as instituições e médias por período).
 * 
 * @param {string} modalidade - Nome exato da modalidade (ex.: "Crédito pessoal não consignado - Prefixado").
 * @param {string} instituicao - Nome da instituição (ex.: "BCO DO BRASIL S.A.").
 * @param {string} dataISO - Data no formato YYYY-MM-DD.
 * @returns {Object} { taxaBanco, mediaMercadoCalculada, totalInstituicoes, periodoReferencia }
 */
function consultarTaxaOlindaDiaria(modalidade, instituicao, dataISO) {
  const modalidadeEncoded = encodeURIComponent(modalidade);
  const dataRef = new Date(dataISO);
  
  // Janela de busca: 15 dias antes até 15 dias depois
  const dataInicioJanela = new Date(dataRef.getTime() - 15 * 24 * 60 * 60 * 1000);
  const dataFimJanela = new Date(dataRef.getTime() + 15 * 24 * 60 * 60 * 1000);
  const dtInicioStr = formatarDataISO(dataInicioJanela);
  const dtFimStr = formatarDataISO(dataFimJanela);

  // Filtro OData
  const filtro = "Modalidade eq '" + modalidade + "' and InicioPeriodo ge '" + dtInicioStr + "' and InicioPeriodo le '" + dtFimStr + "'";
  const url = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosDiariaPorInicioPeriodo?$filter=" + encodeURIComponent(filtro) + "&$orderby=InicioPeriodo%20desc&$format=json";

  const respostaJson = executarHttpComRetry(url, 3);
  if (!respostaJson) return null;

  const parsed = JSON.parse(respostaJson);
  const registros = parsed.value || [];
  if (registros.length === 0) {
    // Tenta busca mais ampla apenas pelo mês de início
    const anoMes = dataISO.substring(0, 7);
    const filtroAmplo = "Modalidade eq '" + modalidade + "' and startswith(InicioPeriodo, '" + anoMes + "')";
    const urlAmpla = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosDiariaPorInicioPeriodo?$filter=" + encodeURIComponent(filtroAmplo) + "&$format=json";
    const respAmpla = executarHttpComRetry(urlAmpla, 2);
    if (!respAmpla) return null;
    const dadosAmplos = JSON.parse(respAmpla);
    if (!dadosAmplos.value || dadosAmplos.value.length === 0) return null;
    return processarRegistrosOlinda(dadosAmplos.value, instituicao);
  }

  return processarRegistrosOlinda(registros, instituicao);
}

/**
 * Processa a lista de registros retornada pelo Olinda para extrair a taxa da instituição e a média do mercado.
 * @param {Array<Object>} registros
 * @param {string} instituicao
 * @returns {Object}
 */
function processarRegistrosOlinda(registros, instituicao) {
  if (!registros || registros.length === 0) return null;

  // Agrupa pelo período mais recente presente nos resultados
  const periodoMaisRecente = registros[0].InicioPeriodo;
  const registrosPeriodo = registros.filter(function(r) {
    return r.InicioPeriodo === periodoMaisRecente;
  });

  // Localiza a instituição específica (ex.: BCO DO BRASIL S.A.)
  const instNorm = normalizarTexto(instituicao);
  let itemBanco = registrosPeriodo.find(function(r) {
    return normalizarTexto(r.InstituicaoFinanceira) === instNorm;
  });

  // Se não encontrar por igualdade exata, tenta correspondência parcial
  if (!itemBanco) {
    itemBanco = registrosPeriodo.find(function(r) {
      const nomeR = normalizarTexto(r.InstituicaoFinanceira);
      return nomeR.includes("DO BRASIL") || nomeR.includes("BANCO DO BRASIL") || nomeR.includes("BCO DO BRASIL");
    });
  }

  // Calcula a média aritmética simples das taxas do mercado no período
  let somaTaxasMes = 0;
  let totalComTaxa = 0;
  registrosPeriodo.forEach(function(r) {
    if (r.TaxaJurosAoMes && Number(r.TaxaJurosAoMes) > 0) {
      somaTaxasMes += Number(r.TaxaJurosAoMes);
      totalComTaxa++;
    }
  });

  const mediaCalculada = totalComTaxa > 0 ? somaTaxasMes / totalComTaxa : null;

  return {
    taxaBanco: itemBanco || null,
    mediaMercadoCalculada: mediaCalculada,
    totalInstituicoes: registrosPeriodo.length,
    periodoReferencia: periodoMaisRecente + " a " + (registrosPeriodo[0].FimPeriodo || "")
  };
}

/**
 * Consulta a série histórica de um índice de correção monetária no SGS (IPCA, INPC, Selic, etc.).
 * Limite de janela máxima de 10 anos respeitado.
 * 
 * @param {string} codigoSerie - Ex.: "433" (IPCA), "188" (INPC), "4390" (Selic).
 * @param {string} dataInicial - Data inicial DD/MM/YYYY.
 * @param {string} dataFinal - Data final DD/MM/YYYY.
 * @returns {Array<Object>} Lista de { data, valor }.
 */
function consultarSerieIndicesSGS(codigoSerie, dataInicial, dataFinal) {
  const url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs." + codigoSerie + "/dados?formato=json&dataInicial=" + dataInicial + "&dataFinal=" + dataFinal;
  const respostaJson = executarHttpComRetry(url, 3);
  if (!respostaJson) return [];
  
  try {
    const dados = JSON.parse(respostaJson);
    return Array.isArray(dados) ? dados : [];
  } catch (e) {
    Logger.log("Erro ao parsear resposta do SGS para série " + codigoSerie + ": " + e.message);
    return [];
  }
}

/**
 * Executa requisição HTTP com política de retry e backoff exponencial.
 * @param {string} url - URL de destino.
 * @param {number} [maxTentativas=3] - Número máximo de tentativas.
 * @returns {string|null} Conteúdo textual retornado ou null.
 */
function executarHttpComRetry(url, maxTentativas) {
  const tentativas = maxTentativas || 3;
  let delayMs = 1000;

  for (let t = 1; t <= tentativas; t++) {
    try {
      let resposta;
      if (typeof UrlFetchApp !== "undefined") {
        // Ambiente Google Apps Script oficial
        resposta = UrlFetchApp.fetch(url, {
          method: "get",
          muteHttpExceptions: true,
          headers: {
            "User-Agent": "SistemaRevisionalAdvocacia/1.0",
            "Accept": "application/json"
          }
        });
        const statusCode = resposta.getResponseCode();
        if (statusCode >= 200 && statusCode < 300) {
          return resposta.getContentText();
        } else if (statusCode === 404) {
          return null;
        }
        throw new Error("HTTP Status " + statusCode);
      } else if (fetchHttp) {
        // Ambiente de teste Node.js
        resposta = fetchHttp(url);
        return resposta.getContentText();
      }
    } catch (e) {
      if (t === tentativas) {
        Logger.log("Falha definitiva na requisição (" + t + "/" + tentativas + "): " + url + " - Erro: " + e.message);
        throw e;
      }
      Logger.log("Tentativa " + t + " falhou para " + url + ". Aguardando " + delayMs + "ms... Erro: " + e.message);
      if (typeof Utilities !== "undefined") {
        Utilities.sleep(delayMs);
      } else {
        // Em Node.js
        const esperaAte = Date.now() + delayMs;
        while (Date.now() < esperaAte) {}
      }
      delayMs *= 2; // Backoff exponencial: 1s, 2s, 4s
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// Módulo de Gerenciamento do Cache na Aba TaxasBCB
// --------------------------------------------------------------------------

/**
 * Lê uma taxa do cache persistente se ainda estiver dentro do TTL.
 * @param {string} chaveCache
 * @returns {Object|null}
 */
function obterCacheTaxa(chaveCache) {
  if (typeof SpreadsheetApp === "undefined") return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  const sheet = ss.getSheetByName("TaxasBCB");
  if (!sheet) return null;

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha <= 1) return null;

  const dados = sheet.getRange(2, 1, ultimaLinha - 1, 11).getValues();
  const agora = new Date().getTime();

  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i];
    if (linha[0] === chaveCache) {
      const expiraEm = linha[10] ? new Date(linha[10]).getTime() : 0;
      if (expiraEm > agora) {
        return {
          taxaMediaMensal: Number(linha[5]),
          taxaMediaAnual: Number(linha[6]),
          taxaBancoMensal: Number(linha[5]),
          taxaBancoAnual: Number(linha[6]),
          posicaoRanking: linha[7] ? Number(linha[7]) : null,
          fonte: String(linha[8]),
          buscadoEm: String(linha[9])
        };
      }
    }
  }

  return null;
}

/**
 * Salva ou atualiza a taxa no cache persistente com TTL configurado.
 * @param {string} chaveCache
 * @param {Object} dadosTaxa
 */
function salvarCacheTaxa(chaveCache, dadosTaxa) {
  if (typeof SpreadsheetApp === "undefined") return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  const sheet = ss.getSheetByName("TaxasBCB");
  if (!sheet) return;

  const configs = typeof obterConfiguracoesRevisional === "function" ? obterConfiguracoesRevisional() : {};
  const ttlDias = configs.cache_bcb_ttl_dias || 30;

  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + ttlDias * 24 * 60 * 60 * 1000);

  const novaLinha = [
    chaveCache,
    "PERIODO",
    dadosTaxa.modalidade || "",
    dadosTaxa.instituicao || "",
    dadosTaxa.anoMes || "",
    dadosTaxa.taxaMediaMensal || 0,
    dadosTaxa.taxaMediaAnual || 0,
    dadosTaxa.posicaoRanking || "",
    dadosTaxa.fonte || "",
    agora.toISOString(),
    expiraEm.toISOString()
  ];

  // Verifica se já existe linha com a mesma chave para atualizar
  const ultimaLinha = sheet.getLastRow();
  let linhaAtualizada = false;

  if (ultimaLinha > 1) {
    const chaves = sheet.getRange(2, 1, ultimaLinha - 1, 1).getValues();
    for (let i = 0; i < chaves.length; i++) {
      if (chaves[i][0] === chaveCache) {
        sheet.getRange(i + 2, 1, 1, novaLinha.length).setValues([novaLinha]);
        linhaAtualizada = true;
        break;
      }
    }
  }

  if (!linhaAtualizada) {
    sheet.appendRow(novaLinha);
  }
}

// --------------------------------------------------------------------------
// Utilitários de Data e Texto
// --------------------------------------------------------------------------

/**
 * Normaliza qualquer data (DD/MM/YYYY ou YYYY-MM-DD) para YYYY-MM-DD.
 * @param {string|Date} dataEntrada
 * @returns {string}
 */
function padronizarDataParaISO(dataEntrada) {
  if (!dataEntrada) return "";
  if (dataEntrada instanceof Date) {
    return formatarDataISO(dataEntrada);
  }
  const str = String(dataEntrada).trim();
  if (str.includes("/")) {
    const partes = str.split("/");
    if (partes.length === 3) {
      return partes[2] + "-" + String(partes[1]).padStart(2, "0") + "-" + String(partes[0]).padStart(2, "0");
    }
  }
  if (str.includes("-")) {
    const partes = str.split("-");
    if (partes.length === 3) {
      if (partes[0].length === 4) return str;
      return partes[2] + "-" + String(partes[1]).padStart(2, "0") + "-" + String(partes[0]).padStart(2, "0");
    }
  }
  return "";
}

/**
 * Utilitário para formatar datas no padrão ISO YYYY-MM-DD.
 * @param {Date|string} d
 * @returns {string}
 */
function formatarDataISO(d) {
  if (!d) return "";
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const ano = dt.getFullYear();
  const mes = String(dt.getMonth() + 1).padStart(2, "0");
  const dia = String(dt.getDate()).padStart(2, "0");
  return ano + "-" + mes + "-" + dia;
}

/**
 * Normaliza strings para comparação (remove acentos e espaços extras, caixa alta).
 * @param {string} texto
 * @returns {string}
 */
function normalizarTexto(texto) {
  if (!texto) return "";
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

// Exportação para testes locais em Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    consultarTaxasBancoCentral: consultarTaxasBancoCentral,
    consultarTaxaMediaSGS: consultarTaxaMediaSGS,
    consultarTaxaOlindaDiaria: consultarTaxaOlindaDiaria,
    consultarSerieIndicesSGS: consultarSerieIndicesSGS,
    obterCodigoSerieSGSPorModalidade: obterCodigoSerieSGSPorModalidade,
    padronizarDataParaISO: padronizarDataParaISO,
    normalizarTexto: normalizarTexto
  };
}
