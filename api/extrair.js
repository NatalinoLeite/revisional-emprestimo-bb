/**
 * @file api/extrair.js
 * @description Serverless Function Vercel: Extração documental de contratos via Google Gemini ou OpenAI (ChatGPT).
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

    const provider = (process.env.LLM_PROVIDER || "GEMINI").toUpperCase();
    let rawDados = null;
    let provedorUtilizado = "";

    const promptExtracao = 
      "Você é um perito contábil especializado em análise de contratos bancários brasileiros (em especial 'BB Crédito Salário' do Banco do Brasil).\n" +
      "Analise o documento anexo e retorne OBRIGATORIAMENTE um JSON estrito com os campos:\n" +
      "{\n" +
      '  "banco": "Nome do Banco (ex: BCO DO BRASIL S.A.)",\n' +
      '  "modalidade": "Crédito pessoal não consignado - Prefixado",\n' +
      '  "numeroContrato": "número da operação",\n' +
      '  "dataContrato": "AAAA-MM-DD",\n' +
      '  "dataPrimeiraParcela": "AAAA-MM-DD",\n' +
      '  "valorLiberado": 0.00,\n' +
      '  "prazo": 0,\n' +
      '  "valorParcela": 0.00,\n' +
      '  "taxaMensalContrato": 0.00,\n' +
      '  "taxaAnualContrato": 0.00,\n' +
      '  "tarifaCadastro": 0.00,\n' +
      '  "seguroPrestamista": 0.00,\n' +
      '  "outrasTarifas": 0.00\n' +
      "}\n" +
      "Apenas o JSON, sem markdown ou explicações.";

    // 1. TENTATIVA COM GEMINI (se configurado ou como primário)
    if (provider === "GEMINI" && process.env.GEMINI_API_KEY) {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
            responseMimeType: "application/json"
          }
        };

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          const data = await resp.json();
          const texto = data.candidates[0].content.parts[0].text;
          rawDados = JSON.parse(texto);
          provedorUtilizado = `Google Gemini (${model})`;
        }
      } catch (errGemini) {
        console.warn("Falha no Gemini, tentando fallback:", errGemini.message);
      }
    }

    // 2. TENTATIVA COM OPENAI (CHATGPT) (se configurado ou como fallback)
    if (!rawDados && process.env.OPENAI_API_KEY) {
      try {
        const openaiKey = process.env.OPENAI_API_KEY;
        const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
        const urlOpenAI = "https://api.openai.com/v1/chat/completions";

        const messages = [
          {
            role: "system",
            content: "Você é um perito financeiro em contratos bancários brasileiros. Retorne SOMENTE JSON puro."
          },
          {
            role: "user",
            content: [
              { type: "text", text: promptExtracao },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${arquivoBase64}`
                }
              }
            ]
          }
        ];

        const respOpenAI = await fetch(urlOpenAI, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: openaiModel,
            messages: messages,
            temperature: 0.1,
            response_format: { type: "json_object" }
          })
        });

        if (respOpenAI.ok) {
          const dataOpenAI = await respOpenAI.json();
          const texto = dataOpenAI.choices[0].message.content;
          rawDados = JSON.parse(texto);
          provedorUtilizado = `OpenAI (${openaiModel})`;
        }
      } catch (errOpenAI) {
        console.warn("Falha na OpenAI:", errOpenAI.message);
      }
    }

    if (!rawDados) {
      throw new Error("Não foi possível extrair dados com nenhum dos provedores de IA (Gemini / OpenAI). Verifique as chaves nas variáveis de ambiente.");
    }

    // Validação contábil e higienização estrita
    const resultadoValidacao = ia.validarESanitizarExtracao(rawDados);

    return res.status(200).json({
      sucesso: true,
      provedor: provedorUtilizado,
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
