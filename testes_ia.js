/**
 * @file testes_ia.js
 * @description Suite de testes para validação e sanitização dos dados da IA e provedores.
 */

const ia = require("./ia.gs");

function assert(condicao, msg) {
  if (!condicao) {
    throw new Error("FALHA NA ASSERÇÃO: " + msg);
  }
}

function rodarTestesIA() {
  console.log("\n========================================================");
  console.log("🤖 EXECUTANDO TESTES DO MÓDULO DE IA (ia.gs)");
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

  // 1. Sanitização de Extração Perfeita
  executar("1. Sanitização de dados válidos extraídos pela IA", () => {
    const raw = {
      banco: "Banco do Brasil S.A.",
      modalidade: "BB Crédito Salário",
      numeroContrato: "987654321",
      dataContrato: "15/03/2023",
      dataPrimeiraParcela: "15/04/2023",
      valorLiberado: 25000.0,
      valorTotalFinanciado: 26800.0,
      prazo: 60,
      valorParcela: 980.50,
      taxaMensalContrato: 3.45,
      taxaAnualContrato: 50.17,
      cetMensal: 3.80,
      cetAnual: 56.40,
      iof: 650.0,
      tarifaCadastro: 550.0,
      seguroPrestamista: 600.0,
      outrasTarifas: 0.0,
      sistemaAmortizacao: "PRICE"
    };

    const res = ia.validarESanitizarExtracao(raw);
    assert(res.valido === true, "Dados devem ser válidos");
    assert(res.alertas.length === 0, "Sem alertas");
    assert(res.dadosSanitizados.dataContrato === "2023-03-15", "Data convertida para ISO");
    assert(res.dadosSanitizados.valorLiberado === 25000.0, "Valor liberado correto");
    assert(res.dadosSanitizados.totalTarifas === 550.0, "Total de tarifas somado");
    assert(res.dadosSanitizados.seguroPrestamista === 600.0, "Seguro preservado");
  });

  // 2. Detecção de Inconsistências e Alertas
  executar("2. Detecção de anomalias na extração da IA", () => {
    const rawInvalido = {
      banco: "Banco do Brasil",
      modalidade: "BB Crédito Salário",
      dataContrato: "data_ilegivel",
      valorLiberado: 0,
      prazo: 500, // Fora do limite aceitável de 360 meses
      valorParcela: 0,
      taxaMensalContrato: 65.0 // Provavelmente taxa anual informada no campo mensal
    };

    const res = ia.validarESanitizarExtracao(rawInvalido);
    assert(res.valido === false, "Deve apontar como inválido");
    assert(res.alertas.length >= 4, "Deve gerar pelo menos 4 alertas de inconsistência");
    console.log("   -> Alertas identificados com sucesso:", res.alertas);
  });

  // 3. Salvamento de Contrato no Drive (Mock para testes)
  executar("3. Upload e persistência no Drive (Mock / GAS)", () => {
    const fileRes = ia.salvarContratoNoDrive("VGVzdGUgQmFzZTY0", "contrato.pdf", "application/pdf", "João da Silva");
    assert(fileRes.fileId !== "", "Deve retornar fileId");
    assert(fileRes.nome === "contrato.pdf", "Nome do arquivo preservado");
  });

  // 4. Instanciação e chave do provedor
  executar("4. Camada de abstração de provedor LLM", () => {
    const provedor = ia.obterProvedorLLM();
    assert(provedor !== null, "Provedor deve ser instanciado");
    assert(typeof provedor.chamarComArquivo === "function", "Deve ter método chamarComArquivo");
    assert(typeof provedor.chamarTexto === "function", "Deve ter método chamarTexto");
  });

  console.log("\n--------------------------------------------------------");
  console.log("📊 RESULTADO DOS TESTES DE IA: " + passaram + "/" + (passaram + falharam) + " passaram (" + (falharam === 0 ? "100% SUCESSO" : "COM FALHAS") + ")");
  console.log("--------------------------------------------------------\n");

  if (falharam > 0) process.exit(1);
}

rodarTestesIA();
