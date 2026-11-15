/**
 * @file testes_vercel_api.js
 * @description Teste das Serverless Functions da Vercel (api/calcular.js e api/bcb.js).
 */

const handlerCalcular = require("./api/calcular.js");
const handlerBCB = require("./api/bcb.js");

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

  console.log("\n--------------------------------------------------------");
  console.log("📊 RESULTADO DOS TESTES VERCEL: " + passaram + "/" + (passaram + falharam) + " passaram (" + (falharam === 0 ? "100% SUCESSO" : "COM FALHAS") + ")");
  console.log("--------------------------------------------------------\n");

  if (falharam > 0) process.exit(1);
}

testarApisVercel();
