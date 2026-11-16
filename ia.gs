/**
 * @file ia.gs
 * @description Módulo de Inteligência Artificial para extração documental e redação jurídica.
 * REGRA CENTRAL: A IA apenas extrai dados do contrato e redige texto a partir de cálculos determinísticos já concluídos.
 * NUNCA solicita cálculo à IA.
 */

// Fallback para Logger fora do GAS
var Logger = typeof Logger !== "undefined" ? Logger : {
  log: function() {
    if (typeof console !== "undefined") console.log.apply(console, arguments);
  }
};

/**
 * Utilitário para padronizar datas (DD/MM/YYYY ou YYYY-MM-DD) para YYYY-MM-DD.
 */
function padronizarDataParaISO(dataEntrada) {
  if (!dataEntrada) return "";
  if (dataEntrada instanceof Date) {
    const ano = dataEntrada.getFullYear();
    const mes = String(dataEntrada.getMonth() + 1).padStart(2, "0");
    const dia = String(dataEntrada.getDate()).padStart(2, "0");
    return ano + "-" + mes + "-" + dia;
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
 * Salva um arquivo de contrato (PDF ou imagem) no Google Drive em pasta dedicada.
 * 
 * @param {string} arquivoBase64 - Conteúdo do arquivo codificado em base64.
 * @param {string} nomeArquivo - Nome do arquivo (ex.: "contrato_bb_12345.pdf").
 * @param {string} mimeType - Tipo MIME (ex.: "application/pdf", "image/jpeg").
 * @param {string} [clienteNome] - Nome do cliente para criação de subpasta organizada.
 * @returns {Object} { fileId, fileUrl, nome, tamanhoBytes }
 */
function salvarContratoNoDrive(arquivoBase64, nomeArquivo, mimeType, clienteNome) {
  if (typeof DriveApp === "undefined") {
    // Modo de simulação para testes fora do Google Apps Script
    return {
      fileId: "mock_drive_file_id_12345",
      fileUrl: "https://drive.google.com/file/d/mock_drive_file_id_12345/view",
      nome: nomeArquivo,
      tamanhoBytes: arquivoBase64 ? arquivoBase64.length : 0
    };
  }

  const nomePastaRaiz = "Contratos Revisional";
  let pastaRaiz;
  const pastas = DriveApp.getFoldersByName(nomePastaRaiz);

  if (pastas.hasNext()) {
    pastaRaiz = pastas.next();
  } else {
    pastaRaiz = DriveApp.createFolder(nomePastaRaiz);
  }

  let pastaDestino = pastaRaiz;
  if (clienteNome) {
    const nomeSubpasta = clienteNome.trim().replace(/[\\/:*?"<>|]/g, "_");
    const subpastas = pastaRaiz.getFoldersByName(nomeSubpasta);
    if (subpastas.hasNext()) {
      pastaDestino = subpastas.next();
    } else {
      pastaDestino = pastaRaiz.createFolder(nomeSubpasta);
    }
  }

  const bytes = Utilities.base64Decode(arquivoBase64);
  const blob = Utilities.newBlob(bytes, mimeType, nomeArquivo);
  const arquivo = pastaDestino.createFile(blob);

  return {
    fileId: arquivo.getId(),
    fileUrl: arquivo.getUrl(),
    nome: arquivo.getName(),
    tamanhoBytes: arquivo.getSize()
  };
}

/**
 * Extrai dados estruturados de um contrato bancário (PDF ou imagem) via Gemini API.
 * Retorna dados estritamente validados segundo o JSON Schema de revisão.
 * 
 * @param {string} arquivoBase64 - Conteúdo do arquivo em base64.
 * @param {string} mimeType - "application/pdf", "image/png", "image/jpeg", etc.
 * @returns {Object} { sucesso, dados, alertas, bruto }
 */
function extrairDadosContratoComIA(arquivoBase64, mimeType) {
  if (!arquivoBase64 || !mimeType) {
    throw new Error("Arquivo base64 e mimeType são obrigatórios para extração com IA.");
  }

  const promptExtracao = 
    "Você é um perito contábil e assistente jurídico especializado na análise de contratos bancários brasileiros de crédito pessoal, em especial 'BB Crédito Salário' do Banco do Brasil.\n" +
    "Examine atentamente o documento anexo (contrato, cédula de crédito bancário - CCB, ou extrato detalhado de operação).\n" +
    "Extraia com precisão absoluta os dados da contratação solicitados no JSON Schema.\n" +
    "Instruções específicas:\n" +
    "- 'banco': Nome da instituição financeira credora (ex.: 'Banco do Brasil S.A.').\n" +
    "- 'modalidade': Nome do produto (ex.: 'BB Crédito Salário', 'Crédito Pessoal Não Consignado').\n" +
    "- 'valorLiberado': Valor líquido creditado na conta corrente do cliente em R$.\n" +
    "- 'valorTotalFinanciado': Valor bruto financiado com IOF e tarifas.\n" +
    "- 'prazo': Número total de prestações/meses contratados (ex.: 48, 60).\n" +
    "- 'valorParcela': Valor da prestação mensal em R$.\n" +
    "- 'taxaMensalContrato': Taxa de juros remuneratórios mensal declarada (% a.m.).\n" +
    "- 'taxaAnualContrato': Taxa de juros anual declarada (% a.a.).\n" +
    "- 'cetMensal': Custo Efetivo Total mensal (% a.m.).\n" +
    "- 'cetAnual': Custo Efetivo Total anual (% a.a.).\n" +
    "- 'iof': Valor do IOF em R$.\n" +
    "- 'tarifaCadastro': Valor da Tarifa de Cadastro / TAC / Confecção de Cadastro em R$.\n" +
    "- 'seguroPrestamista': Valor cobrado a título de Seguro Prestamista / Proteção Financeira em R$.\n" +
    "- 'outrasTarifas': Soma de outras tarifas acessórias (avaliação, registro, serviços de terceiros).\n" +
    "- 'dataContrato': Data da celebração no formato AAAA-MM-DD (ex.: '2023-04-15').\n" +
    "- 'dataPrimeiraParcela': Data do primeiro vencimento no formato AAAA-MM-DD.\n" +
    "- Se algum campo não estiver presente ou ilegível, informe 0 para números ou string vazia para textos. NUNCA invente dados.";

  const schemaExtracao = {
    type: "OBJECT",
    properties: {
      banco: { type: "STRING" },
      modalidade: { type: "STRING" },
      numeroContrato: { type: "STRING" },
      dataContrato: { type: "STRING" },
      dataPrimeiraParcela: { type: "STRING" },
      valorLiberado: { type: "NUMBER" },
      valorTotalFinanciado: { type: "NUMBER" },
      prazo: { type: "INTEGER" },
      valorParcela: { type: "NUMBER" },
      taxaMensalContrato: { type: "NUMBER" },
      taxaAnualContrato: { type: "NUMBER" },
      cetMensal: { type: "NUMBER" },
      cetAnual: { type: "NUMBER" },
      iof: { type: "NUMBER" },
      tarifaCadastro: { type: "NUMBER" },
      seguroPrestamista: { type: "NUMBER" },
      outrasTarifas: { type: "NUMBER" },
      sistemaAmortizacao: { type: "STRING" },
      observacoes: { type: "STRING" }
    },
    required: ["banco", "modalidade", "valorLiberado", "prazo", "valorParcela", "taxaMensalContrato"]
  };

  const provedor = obterProvedorLLM();
  const respostaTexto = provedor.chamarComArquivo({
    prompt: promptExtracao,
    arquivoBase64: arquivoBase64,
    mimeType: mimeType,
    jsonSchema: schemaExtracao
  });

  let dadosExtraidos;
  try {
    dadosExtraidos = JSON.parse(respostaTexto);
  } catch (e) {
    throw new Error("A IA não retornou um JSON válido. Resposta: " + respostaTexto);
  }

  // Validação e sanitização estrita dos dados
  const resultadoValidacao = validarESanitizarExtracao(dadosExtraidos);

  return {
    sucesso: true,
    dados: resultadoValidacao.dadosSanitizados,
    alertas: resultadoValidacao.alertas,
    bruto: dadosExtraidos
  };
}

/**
 * Valida os dados extraídos pela IA, garantindo tipagem, limites de sanidade financeira e preenchimento de campos essenciais.
 * 
 * @param {Object} raw
 * @returns {Object} { valido, dadosSanitizados, alertas }
 */
function validarESanitizarExtracao(raw) {
  const alertas = [];
  const dados = {};

  dados.banco = String(raw.banco || "BCO DO BRASIL S.A.").trim();
  dados.modalidade = String(raw.modalidade || "Crédito pessoal não consignado - Prefixado").trim();
  dados.numeroContrato = String(raw.numeroContrato || "").trim();
  
  // Datas
  dados.dataContrato = padronizarDataParaISO(raw.dataContrato);
  if (!dados.dataContrato) {
    alertas.push("Data do contrato não identificada claramente ou ilegível.");
  }
  dados.dataPrimeiraParcela = padronizarDataParaISO(raw.dataPrimeiraParcela) || dados.dataContrato;

  // Valores Numéricos
  dados.valorLiberado = Math.max(0, Number(raw.valorLiberado) || 0);
  if (dados.valorLiberado <= 0) {
    alertas.push("Valor liberado/financiado não foi identificado ou é zero.");
  }

  dados.valorTotalFinanciado = Math.max(0, Number(raw.valorTotalFinanciado) || dados.valorLiberado);
  dados.prazo = parseInt(raw.prazo, 10) || 0;
  if (dados.prazo <= 0 || dados.prazo > 360) {
    alertas.push("Prazo do contrato inválido ou fora da faixa aceitável (1 a 360 meses).");
  }

  dados.valorParcela = Math.max(0, Number(raw.valorParcela) || 0);
  if (dados.valorParcela <= 0) {
    alertas.push("Valor da parcela mensal não identificado ou é zero.");
  }

  dados.taxaMensalContrato = Math.max(0, Number(raw.taxaMensalContrato) || 0);
  if (dados.taxaMensalContrato > 50) {
    alertas.push("Taxa de juros mensal superior a 50% a.m. - Verifique se não foi informada a taxa anual.");
  }

  dados.taxaAnualContrato = Math.max(0, Number(raw.taxaAnualContrato) || 0);
  dados.cetMensal = Math.max(0, Number(raw.cetMensal) || 0);
  dados.cetAnual = Math.max(0, Number(raw.cetAnual) || 0);

  // Tarifas e Encargos
  dados.iof = Math.max(0, Number(raw.iof) || 0);
  dados.tarifaCadastro = Math.max(0, Number(raw.tarifaCadastro) || 0);
  dados.seguroPrestamista = Math.max(0, Number(raw.seguroPrestamista) || 0);
  dados.outrasTarifas = Math.max(0, Number(raw.outrasTarifas) || 0);
  dados.totalTarifas = dados.tarifaCadastro + dados.outrasTarifas;

  dados.sistemaAmortizacao = String(raw.sistemaAmortizacao || "PRICE").toUpperCase();
  dados.observacoes = String(raw.observacoes || "").trim();

  return {
    valido: alertas.length === 0,
    dadosSanitizados: dados,
    alertas: alertas
  };
}

/**
 * Redige um resumo jurídico executivo e fundamentação preliminar do caso a partir dos resultados
 * já calculados deterministicamente pelo motor financeiro.
 * 
 * A IA NÃO pode calcular nem alterar nenhum número. Recebe os números prontos como fatos estritos.
 * 
 * @param {Object} resultadoMotor - Objeto retornado por motor.gs: calcularRevisionalCompleta().
 * @param {Object} [dadosCliente] - { nome, cpf, banco, numeroProcesso }
 * @returns {string} Texto formatado em Markdown pronto para petição inicial ou parecer.
 */
function gerarSinteseJuridicaComIA(resultadoMotor, dadosCliente) {
  if (!resultadoMotor || !resultadoMotor.dadosContrato) {
    throw new Error("Resultado do cálculo financeiro é obrigatório para geração da síntese.");
  }

  const dc = resultadoMotor.dadosContrato;
  const sem = resultadoMotor.semaforo;
  const cB = resultadoMotor.cenarios.B;
  const cC = resultadoMotor.cenarios.C;
  const cliente = dadosCliente || {};

  const promptSintese = 
    "Você é um advogado especialista em Direito Bancário no Brasil.\n" +
    "Redija uma síntese jurídica concisa e fundamentada para a petição inicial ou parecer revisional com base ESTRITAMENTE nos fatos e cálculos auditados abaixo.\n" +
    "REGRA ABSOLUTA: NÃO recalcule nada e NÃO altere nenhum valor numérico. Utilize exatamente os números fornecidos.\n\n" +
    "DADOS DO CASO:\n" +
    "- Cliente: " + (cliente.nome || "Cliente do Escritório") + "\n" +
    "- Instituição Ré: " + (cliente.banco || "Banco do Brasil S.A.") + "\n" +
    "- Valor Financiado: R$ " + dc.valorLiberado.toFixed(2) + "\n" +
    "- Prazo: " + dc.prazo + " meses (" + dc.parcelasPagas + " pagas, " + dc.parcelasVincendas + " vincendas)\n" +
    "- Parcela Atual Cobrada: R$ " + dc.valorParcela.toFixed(2) + "\n" +
    "- Taxa Contratual Efetiva Implícita: " + dc.taxaImplicitaMensal.toFixed(2) + "% a.m. (" + dc.taxaImplicitaAnual.toFixed(2) + "% a.a.)\n" +
    "- Taxa Média de Mercado do BACEN: " + dc.taxaMediaBCBMensal.toFixed(2) + "% a.m. (" + dc.taxaMediaBCBAnual.toFixed(2) + "% a.a.)\n" +
    "- Razão de Disparidade: " + dc.razaoTaxaMercado.toFixed(2) + "x a média de mercado\n" +
    "- Tarifas/Seguros Questionáveis: R$ " + dc.totalExpurgos.toFixed(2) + " (Tarifas: R$ " + dc.tarifasExpurgadas.toFixed(2) + ", Seguro: R$ " + dc.seguroExpurgado.toFixed(2) + ")\n" +
    "- Nova Parcela Recalculada (Cenário STJ 1,5x): R$ " + cC.novaParcela.toFixed(2) + " (Redução de R$ " + cC.reducaoParcela.toFixed(2) + " por mês)\n" +
    "- Indébito Estimado (Parcelas já pagas): R$ " + cC.indebitoAplicado.toFixed(2) + "\n" +
    "- Redução no Saldo Devedor Vincendo: R$ " + cC.reducaoSaldoDevedor.toFixed(2) + "\n" +
    "- Proveito Econômico Total Estimado: R$ " + cC.proveitoTotalEstimado.toFixed(2) + "\n" +
    "- Classificação de Viabilidade (Semáforo): " + sem.cor + " - " + sem.titulo + "\n\n" +
    "ESTRUTURA DESEJADA DO TEXTO:\n" +
    "1. Dos Fatos e da Relação Contratual (resumo claro da operação);\n" +
    "2. Da Abusividade da Taxa de Juros Remuneratórios (confronto da taxa contratada com a taxa média do BCB, invocando a Súmula 382/STJ e o REsp 1.061.530/RS);\n" +
    "3. Da Ilegalidade das Tarifas Acessórias e Venda Casada de Seguro (Tema 958 e 972/STJ, art. 39, I do CDC);\n" +
    "4. Do Pedido de Recálculo e Repetição de Indébito (art. 42 do CDC);\n" +
    "5. Conclusão da Triagem.\n" +
    "Escreva de forma persuasiva, elegante e técnica em Português do Brasil.";

  const provedor = obterProvedorLLM();
  return provedor.chamarTexto({
    prompt: promptSintese,
    systemInstruction: "Você é um consultor jurídico sênior em Direito Bancário. Redija textos técnicos fundamentados na jurisprudência do STJ sem inventar cálculos."
  });
}

// --------------------------------------------------------------------------
// Camada Abstrata de Provedores de LLM
// --------------------------------------------------------------------------

/**
 * Obtém a instância do provedor LLM configurado (Padrão: Gemini).
 * Permite alternar para OpenAI no futuro através da Script Property 'LLM_PROVIDER'.
 */
function obterProvedorLLM() {
  const providerType = obterPropriedadeScript("LLM_PROVIDER") || "GEMINI";

  if (providerType.toUpperCase() === "OPENAI") {
    return new OpenAIProvider();
  }
  return new GeminiProvider();
}

/**
 * Provedor oficial Google Gemini API.
 */
function GeminiProvider() {
  this.chamarComArquivo = function(opts) {
    const apiKey = obterPropriedadeScript("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error(
        "Chave GEMINI_API_KEY não configurada nas Script Properties (Propriedades do Script). " +
        "Acesse Configurações do Projeto > Propriedades do Script e adicione GEMINI_API_KEY."
      );
    }

    const model = obterPropriedadeScript("GEMINI_MODEL") || "gemini-3.8-flash";
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: opts.prompt },
            {
              inlineData: {
                mimeType: opts.mimeType,
                data: opts.arquivoBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: opts.jsonSchema
      }
    };

    const respostaTexto = executarRequisicaoHttpJson(url, payload);
    const parsed = JSON.parse(respostaTexto);

    if (parsed.candidates && parsed.candidates.length > 0) {
      const parts = parsed.candidates[0].content.parts;
      if (parts && parts.length > 0) {
        return parts[0].text;
      }
    }

    throw new Error("Resposta inesperada da Gemini API: " + respostaTexto);
  };

  this.chamarTexto = function(opts) {
    const apiKey = obterPropriedadeScript("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("Chave GEMINI_API_KEY não configurada nas Script Properties.");
    }

    const model = obterPropriedadeScript("GEMINI_MODEL") || "gemini-3.8-flash";
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: opts.prompt }]
        }
      ],
      systemInstruction: opts.systemInstruction ? {
        parts: [{ text: opts.systemInstruction }]
      } : undefined,
      generationConfig: {
        temperature: 0.3
      }
    };

    const respostaTexto = executarRequisicaoHttpJson(url, payload);
    const parsed = JSON.parse(respostaTexto);

    if (parsed.candidates && parsed.candidates.length > 0) {
      return parsed.candidates[0].content.parts[0].text;
    }

    throw new Error("Resposta de texto vazia da Gemini API.");
  };
}

/**
 * Esqueleto de provedor OpenAI para futura expansão / redundância.
 */
function OpenAIProvider() {
  this.chamarComArquivo = function(opts) {
    const apiKey = obterPropriedadeScript("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    throw new Error("Provedor OpenAI para arquivos ainda não habilitado.");
  };

  this.chamarTexto = function(opts) {
    const apiKey = obterPropriedadeScript("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    const url = "https://api.openai.com/v1/chat/completions";
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: opts.systemInstruction || "Assistente jurídico." },
        { role: "user", content: opts.prompt }
      ],
      temperature: 0.3
    };
    const resposta = executarRequisicaoHttpJson(url, payload, { "Authorization": "Bearer " + apiKey });
    const parsed = JSON.parse(resposta);
    return parsed.choices[0].message.content;
  };
}

/**
 * Executa requisição POST com JSON.
 */
function executarRequisicaoHttpJson(url, payload, headersExtras) {
  const headers = Object.assign({
    "Content-Type": "application/json"
  }, headersExtras || {});

  if (typeof UrlFetchApp !== "undefined") {
    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      headers: headers,
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    const text = resp.getContentText();
    if (code >= 200 && code < 300) {
      return text;
    }
    throw new Error("Erro HTTP " + code + " na chamada LLM: " + text);
  } else {
    // Modo Node.js para testes locais
    const syncFetch = require("child_process").execFileSync;
    const pyScript = `
import urllib.request, ssl, sys, json
url = sys.argv[1]
data = sys.argv[2].encode('utf-8')
headers = json.loads(sys.argv[3])
ctx = ssl.create_default_context()
req = urllib.request.Request(url, data=data, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req, context=ctx) as r:
        sys.stdout.write(r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    sys.stderr.write(e.read().decode('utf-8'))
    sys.exit(1)
`;
    try {
      const output = syncFetch("python", ["-c", pyScript, url, JSON.stringify(payload), JSON.stringify(headers)], {
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024
      });
      return output;
    } catch (e) {
      throw new Error("Erro na chamada LLM local: " + e.message);
    }
  }
}

/**
 * Utilitário seguro para ler propriedades do Script (ScriptProperties) com fallback para variáveis de ambiente locais.
 * @param {string} chave
 * @returns {string}
 */
function obterPropriedadeScript(chave) {
  if (typeof PropertiesService !== "undefined") {
    const props = PropertiesService.getScriptProperties();
    if (props) {
      const val = props.getProperty(chave);
      if (val) return val;
    }
  }
  if (typeof process !== "undefined" && process.env && process.env[chave]) {
    return process.env[chave];
  }
  return "";
}

// Exportação para testes locais
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    salvarContratoNoDrive: salvarContratoNoDrive,
    extrairDadosContratoComIA: extrairDadosContratoComIA,
    validarESanitizarExtracao: validarESanitizarExtracao,
    gerarSinteseJuridicaComIA: gerarSinteseJuridicaComIA,
    obterProvedorLLM: obterProvedorLLM
  };
}
