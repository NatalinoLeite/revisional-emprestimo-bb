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
    const {
      arquivoBase64,
      mimeType,
      customGeminiKey,
      customOpenaiKey,
      customModel,
      customProvider
    } = req.body || {};

    if (!arquivoBase64 || !mimeType) {
      return res.status(400).json({ sucesso: false, erro: "arquivoBase64 e mimeType são obrigatórios." });
    }

    const geminiKey = customGeminiKey || process.env.GEMINI_API_KEY;
    const openaiKey = customOpenaiKey || process.env.OPENAI_API_KEY;
    const provider = (customProvider || process.env.LLM_PROVIDER || "GEMINI").toUpperCase();
    const modelEscolhido = customModel || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

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

    // 1. TENTATIVA COM GEMINI (suporta nativamente PDF e imagens)
    if (geminiKey) {
      const apiKey = geminiKey;
      const modelosParaTentar = [
        modelEscolhido,
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3.8-flash"
      ].filter(Boolean);

      // Remove duplicatas
      const modelosUnicos = [...new Set(modelosParaTentar)];

      for (const model of modelosUnicos) {
        try {
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
            const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (texto) {
              rawDados = JSON.parse(texto);
              provedorUtilizado = `Google Gemini (${model})`;
              break; // Sucesso com Gemini
            }
          } else {
            const errData = await resp.json().catch(() => ({}));
            console.warn(`Gemini (${model}) retornou status ${resp.status}:`, errData.error?.message || resp.statusText);
          }
        } catch (errGemini) {
          console.warn(`Exceção no Gemini (${model}):`, errGemini.message);
        }
      }
    }

    // 2. TENTATIVA COM OPENAI (CHATGPT) (apenas para imagens, pois OpenAI não suporta PDFs como image_url)
    if (!rawDados && openaiKey) {
      if (mimeType.startsWith("image/")) {
        try {
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
            const texto = dataOpenAI.choices?.[0]?.message?.content;
            if (texto) {
              rawDados = JSON.parse(texto);
              provedorUtilizado = `OpenAI (${openaiModel})`;
            }
          } else {
            const errOpenAI = await respOpenAI.json().catch(() => ({}));
            console.warn("Falha na chamada OpenAI:", errOpenAI.error?.message || respOpenAI.statusText);
          }
        } catch (errOpenAI) {
          console.warn("Exceção na OpenAI:", errOpenAI.message);
        }
      } else {
        console.warn("OpenAI ignorada para arquivo PDF (OpenAI Chat API suporta apenas imagens).");
      }
    }

    if (!rawDados) {
      const msg = !geminiKey && !openaiKey
        ? "Nenhuma chave de IA configurada. Clique em '⚙️ Configurar Chaves de IA' no topo da tela para inserir sua chave do Google Gemini ou OpenAI."
        : "Não foi possível extrair os dados do documento com a IA. O documento pode ser muito pesado, protegido por senha ou a IA está temporariamente indisponível. Você pode preencher os campos manualmente no Passo 2.";
      throw new Error(msg);
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
