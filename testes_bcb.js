/**
 * @file testes_bcb.js
 * @description Suite de testes da integração com o Banco Central (SGS e Olinda) e fallbacks.
 */

const bcb = require("./bcb.gs");

function assert(condicao, msg) {
  if (!condicao) {
    throw new Error("FALHA NA ASSERÇÃO: " + msg);
  }
}

async function rodarTestesBCB() {
  console.log("\n========================================================");
  console.log("🏦 EXECUTANDO TESTES DE INTEGRAÇÃO BANCO CENTRAL (BCB)");
  console.log("========================================================\n");

  let passaram = 0;
  let falharam = 0;

  function executar(nome, fn) {
    try {
      fn();
      console.log("✅ [PASSOU] " + nome);
      passaram++;
    } catch (e) {
      console.error("❌ [FALHOU] " + nome + ": " + e.message);
      falharam++;
    }
  }

  // 1. Normalização de datas e texto
  executar("1. Padronização de datas (DD/MM/AAAA -> YYYY-MM-DD)", () => {
    assert(bcb.padronizarDataParaISO("10/05/2023") === "2023-05-10", "Data BR deve virar ISO");
    assert(bcb.padronizarDataParaISO("2024-01-15") === "2024-01-15", "Data ISO deve permanecer ISO");
    assert(bcb.normalizarTexto("Banco do Brasil S/A") === "BANCO DO BRASIL S/A", "Texto normalizado");
  });

  // 2. Fallback Manual
  executar("2. Fallback manual quando solicitado", () => {
    const res = bcb.consultarTaxasBancoCentral({
      dataContrato: "2024-01-10",
      fallbackTaxaManual: 4.5,
      usarManualApenas: true
    });
    assert(res.sucesso === true, "Deve ter sucesso");
    assert(res.origem === "MANUAL", "Origem deve ser MANUAL");
    assert(res.taxaMediaMercadoMensal === 4.5, "Taxa manual mensal 4.5%");
    assert(res.fonte.includes("manualmente"), "Fonte indica manual");
  });

  // 3. Consulta SGS Real (Série 25464 - Taxa Média Mensal Crédito Pessoal)
  executar("3. Consulta real SGS Série 25464 (Taxa média mensal de crédito pessoal)", () => {
    const res = bcb.consultarTaxaMediaSGS("25464", "2024-01-15");
    assert(res !== null, "Deve retornar objeto não nulo do SGS");
    assert(res.taxa > 0, "Taxa média deve ser maior que zero (obtido: " + res.taxa + "%)");
    console.log("   -> Taxa média retornada pelo SGS (25464): " + res.taxa + "% a.m. (Ref: " + res.dataReferencia + ")");
  });

  // 4. Consulta Olinda Diária Real (BCO DO BRASIL S.A.)
  executar("4. Consulta real Olinda Diária (Taxa do BCO DO BRASIL S.A.)", () => {
    const res = bcb.consultarTaxaOlindaDiaria("Crédito pessoal não consignado - Prefixado", "BCO DO BRASIL S.A.", "2024-01-15");
    assert(res !== null, "Deve retornar resultado do Olinda");
    assert(res.taxaBanco !== null, "Deve encontrar registro do Banco do Brasil");
    console.log("   -> Taxa Banco do Brasil no período (" + res.periodoReferencia + "): " + res.taxaBanco.TaxaJurosAoMes + "% a.m. (Posição " + res.taxaBanco.Posicao + "º)");
    if (res.mediaMercadoCalculada) {
      console.log("   -> Média do mercado calculada na amostra: " + res.mediaMercadoCalculada.toFixed(2) + "% a.m.");
    }
  });

  // 5. Orquestrador completo com API oficial
  executar("5. Orquestrador consultarTaxasBancoCentral ponta a ponta", () => {
    const res = bcb.consultarTaxasBancoCentral({
      dataContrato: "2024-01-15",
      modalidade: "Crédito pessoal não consignado - Prefixado",
      instituicao: "BCO DO BRASIL S.A."
    });
    assert(res.sucesso === true, "Orquestrador deve retornar sucesso");
    assert(res.taxaMediaMercadoMensal > 0, "Taxa média deve ser válida");
    assert(res.taxaBancoMensal > 0, "Taxa BB deve ser válida");
    console.log("   -> Resultado unificado: Média = " + res.taxaMediaMercadoMensal + "% a.m. | BB = " + res.taxaBancoMensal + "% a.m. | Fonte = " + res.fonte);
  });

  // 6. Consulta Série de Índices (IPCA 433)
  executar("6. Consulta real série de índices de correção (IPCA 433)", () => {
    const indices = bcb.consultarSerieIndicesSGS("433", "01/01/2024", "01/04/2024");
    assert(Array.isArray(indices) && indices.length > 0, "Deve retornar array de índices do IPCA");
    console.log("   -> Meses de IPCA retornados: " + indices.length + " (Primeiro: " + indices[0].data + " = " + indices[0].valor + "%)");
  });

  console.log("\n--------------------------------------------------------");
  console.log("📊 RESULTADO DOS TESTES BCB: " + passaram + "/" + (passaram + falharam) + " passaram (" + (falharam === 0 ? "100% SUCESSO" : "COM FALHAS") + ")");
  console.log("--------------------------------------------------------\n");

  if (falharam > 0) {
    process.exit(1);
  }
}

rodarTestesBCB();
