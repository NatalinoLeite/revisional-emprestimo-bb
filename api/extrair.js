/**
 * @file api/extrair.js
 * @description Serverless Function Vercel: Extração documental de contratos bancários via Google Gemini API.
 */

const ia = require("../ia.gs");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ sucesso: false, erro: "Método não permitido. Utilize POST." });
  }

  try {
    const { arquivoBase64, mimeType } = req.body || {};

    if (!arquivoBase64 || !mimeType) {
      return res.status(400).json({ sucesso: false, erro: "arquivoBase64 e mimeType são obrigatórios." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "Variável de ambiente GEMINI_API_KEY não configurada nas Environment Variables da Vercel."
      });
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const promptExtracao = 
      "Você é um perito contábil e assistente jurídico especializado na análise de contratos bancários brasileiros de crédito pessoal, em especial 'BB Crédito Salário' do Banco do Brasil.\n" +
      "Examine atentamente o documento anexo e extraia com precisão absoluta os dados da contratação no formato JSON solicitado.\n" +
      "- 'banco': Nome do banco (ex.: 'Banco do Brasil S.A.').\n" +
      "- 'modalidade': Nome do produto (ex.: 'BB Crédito Salário', 'Crédito Pessoal Não Consignado').\n" +
      "- 'valorLiberado': Valor líquido financiado em R$.\n" +
      "- 'prazo': Quantidade de parcelas (ex.: 48, 60).\n" +
      "- 'valorParcela': Valor da prestação mensal em R$.\n" +
      "- 'taxaMensalContrato': Taxa de juros mensal declarada (% a.m.).\n" +
      "- 'taxaAnualContrato': Taxa anual declarada (% a.a.).\n" +
      "- 'tarifaCadastro': Valor da Tarifa de Cadastro / TAC em R$.\n" +
      "- 'seguroPrestamista': Valor cobrado de seguro em R$.\n" +
      "- 'outrasTarifas': Outras tarifas acessórias em R$.\n" +
      "- 'dataContrato': Data no formato AAAA-MM-DD.\n" +
      "- 'dataPrimeiraParcela': Data do 1º vencimento no formato AAAA-MM-DD.";

    const schemaExtracao = {
      type: "OBJECT",
      properties: {
        banco: { type: "STRING" },
        modalidade: { type: "STRING" },
        numeroContrato: { type: "STRING" },
        dataContrato: { type: "STRING" },
        dataPrimeiraParcela: { type: "STRING" },
        valorLiberado: { type: "NUMBER" },
        prazo: { type: "INTEGER" },
        valorParcela: { type: "NUMBER" },
        taxaMensalContrato: { type: "NUMBER" },
        taxaAnualContrato: { type: "NUMBER" },
        tarifaCadastro: { type: "NUMBER" },
        seguroPrestamista: { type: "NUMBER" },
        outrasTarifas: { type: "NUMBER" }
      },
      required: ["banco", "modalidade", "valorLiberado", "prazo", "valorParcela", "taxaMensalContrato"]
    };

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: promptExtracao },
            {
              inlineData: {
                mimeType: mimeType,
                data: arquivoBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: schemaExtracao
      }
    };

    const respostaGemini = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!respostaGemini.ok) {
      const errText = await respostaGemini.text();
      throw new Error(`Erro na Gemini API (${respostaGemini.status}): ${errText}`);
    }

    const dataGemini = await respostaGemini.json();
    const textoJson = dataGemini.candidates[0].content.parts[0].text;
    const rawDados = JSON.parse(textoJson);

    // Validação e higienização estrita
    const resultadoValidacao = ia.validarESanitizarExtracao(rawDados);

    return res.status(200).json({
      sucesso: true,
      dados: resultadoValidacao.dadosSanitizados,
      alertas: resultadoValidacao.alertas
    });
  } catch (erro) {
    return res.status(500).json({
      sucesso: false,
      erro: erro.message
    });
  }
};
