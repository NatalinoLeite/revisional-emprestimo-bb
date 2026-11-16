/**
 * @file testes_vercel_api.js
 * @description Teste das Serverless Functions da Vercel (api/calcular.js e api/bcb.js).
 */

const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split(/\r?\n/).forEach(line => {
    const match = line.trim().match(/^([\w.-]+)\s*=\s*(.*)?$/);
    if (match) process.env[match[1]] = match[2].trim();
  });
}

const handlerCalcular = require("./api/calcular.js");
const handlerBCB = require("./api/bcb.js");
const handlerExtrair = require("./api/extrair.js");

function criarMockReqRes(method, body, query) {
  const req = {
    method: method,
    body: body || {},
    query: query || {}
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader: function(k, v) { this.headers[k] = v; },
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) { this.data = data; return this; },
    end: function() { return this; }
  };

  return { req, res };
}

async function testarApisVercel() {
  console.log("\n========================================================");
  console.log("⚡ TESTANDO SERVERLESS FUNCTIONS DA VERCEL (api/*.js)");
  console.log("========================================================\n");

  let passaram = 0;
  let falharam = 0;

  async function executar(nome, fn) {
    try {
      await fn();
      console.log("✅ [PASSOU] " + nome);
      passaram++;
    } catch (e) {
      console.error("❌ [FALHOU] " + nome + ": " + e.message);
      falharam++;
    }
  }

  // 1. Teste api/calcular.js (POST)
  await executar("1. api/calcular.js responde com sucesso e cenários calculados", async () => {
    const { req, res } = criarMockReqRes("POST", {
      valorLiberado: 10000,
      prazo: 24,
      valorParcela: 590.47,
      taxaMensalContrato: 3.0,
      taxaMediaMercado: 1.5,
      parcelasPagas: 12
    });

    await handlerCalcular(req, res);
    if (res.statusCode !== 200) throw new Error("Status code esperado 200, obtido " + res.statusCode);
    if (!res.data || !res.data.sucesso) throw new Error("sucesso deve ser true");
    if (!res.data.resultado.cenarios.B) throw new Error("Cenário B deve existir no resultado");
    console.log("   -> Nova parcela Cenário B (Vercel): R$ " + res.data.resultado.cenarios.B.novaParcela.toFixed(2));
  });

  // 2. Teste api/bcb.js (GET)
  await executar("2. api/bcb.js responde com dados do Banco Central", async () => {
    const { req, res } = criarMockReqRes("GET", null, {
      dataContrato: "2024-01-15",
      modalidade: "Crédito pessoal não consignado - Prefixado",
      instituicao: "BCO DO BRASIL S.A."
    });

    await handlerBCB(req, res);
    if (res.statusCode !== 200) throw new Error("Status code esperado 200, obtido " + res.statusCode);
    if (!res.data || !res.data.sucesso) throw new Error("sucesso deve ser true");
    console.log("   -> Taxa retornada pelo endpoint Vercel: " + res.data.dados.taxaMediaMercadoMensal + "% a.m.");
  });

  // 3. Teste api/extrair.js (POST)
  await executar("3. api/extrair.js lê documento PDF com Gemini IA e sanitiza campos", async () => {
    const pdfText = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<<>>>>endobj\n4 0 obj<</Length 100>>stream\nBT /F1 12 Tf 50 700 Td (Banco do Brasil Contrato 11223344 Valor 15000.00 Prazo 36 meses Taxa 3.80% ao mes) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\n0000000204 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n354\n%%EOF\n';
    const b64 = Buffer.from(pdfText).toString('base64');

    const { req, res } = criarMockReqRes("POST", {
      arquivoBase64: b64,
      mimeType: "application/pdf"
    });

    await handlerExtrair(req, res);
    if (res.statusCode !== 200) throw new Error("Status code esperado 200, obtido " + res.statusCode + " (Erro: " + (res.data?.erro || "") + ")");
    if (!res.data || !res.data.sucesso) throw new Error("sucesso deve ser true: " + (res.data?.erro || ""));
    console.log("   -> Extraído com sucesso via " + res.data.provedor + " (Banco: " + res.data.dados.banco + ", Prazo: " + res.data.dados.prazo + ")");
  });

  console.log("\n--------------------------------------------------------");
  console.log("📊 RESULTADO DOS TESTES VERCEL: " + passaram + "/" + (passaram + falharam) + " passaram (" + (falharam === 0 ? "100% SUCESSO" : "COM FALHAS") + ")");
  console.log("--------------------------------------------------------\n");

  if (falharam > 0) process.exit(1);
}

testarApisVercel();
