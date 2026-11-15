/**
 * @file testes.gs
 * @description Suite de testes unitários automatizados para o motor financeiro e semáforo revisional.
 */

// Se estiver em ambiente Node.js, importa o motor.gs
let motorLib;
if (typeof module !== "undefined" && typeof require !== "undefined") {
  motorLib = require("./motor.gs");
} else {
  // No Google Apps Script, as funções já estão no escopo global
  motorLib = {
    taxaMensalParaAnual: taxaMensalParaAnual,
    taxaAnualParaMensal: taxaAnualParaMensal,
    taxaNominalParaEfetiva: taxaNominalParaEfetiva,
    calcularPMT: calcularPMT,
    calcularTaxaImplicita: calcularTaxaImplicita,
    gerarCronogramaPrice: gerarCronogramaPrice,
    gerarCronogramaSAC: gerarCronogramaSAC,
    gerarCronogramaGauss: gerarCronogramaGauss,
    calcularRevisionalCompleta: calcularRevisionalCompleta,
    avaliarSemaforo: avaliarSemaforo,
    aplicarCorrecaoEJuros: aplicarCorrecaoEJuros,
    formatarDataISO: formatarDataISO
  };
}

/**
 * Função de asserção para testes numéricos com tolerância.
 */
function assertQuaseIgual(obtido, esperado, tolerancia, mensagem) {
  const tol = tolerancia !== undefined ? tolerancia : 0.01;
  const dif = Math.abs(obtido - esperado);
  if (dif > tol) {
    throw new Error(
      (mensagem || "Falha na asserção de quase igualdade") + 
      ": Esperado " + esperado + ", obtido " + obtido + " (Diferença: " + dif + " > " + tol + ")"
    );
  }
}

/**
 * Função de asserção estrita.
 */
function assertIgual(obtido, esperado, mensagem) {
  if (obtido !== esperado) {
    throw new Error(
      (mensagem || "Falha na asserção de igualdade") + 
      ": Esperado '" + esperado + "', obtido '" + obtido + "'"
    );
  }
}

/**
 * Executa todos os testes unitários do motor financeiro.
 * @returns {Object} Relatório detalhado dos testes.
 */
function executarTestesUnitarios() {
  const resultados = [];
  let passaram = 0;
  let falharam = 0;

  function testar(nome, fn) {
    try {
      fn();
      resultados.push({ nome: nome, status: "PASSOU" });
      passaram++;
      if (typeof Logger !== "undefined") {
        Logger.log("✅ [PASSOU] " + nome);
      } else {
        console.log("✅ [PASSOU] " + nome);
      }
    } catch (e) {
      resultados.push({ nome: nome, status: "FALHOU", erro: e.message });
      falharam++;
      if (typeof Logger !== "undefined") {
        Logger.log("❌ [FALHOU] " + nome + ": " + e.message);
      } else {
        console.error("❌ [FALHOU] " + nome + ": " + e.message);
      }
    }
  }

  // -------------------------------------------------------------
  // Teste 1: Parcela Price e Cronograma (Exemplo oficial do prompt)
  // R$ 10.000, 24 parcelas, 3,00% a.m. -> Parcela ~ R$ 590,47
  // Soma das amortizações = 10.000, saldo devedor final = 0
  // -------------------------------------------------------------
  testar("1. Tabela Price - Parcela padrão de R$ 10.000 em 24x a 3,00% a.m.", function() {
    const pv = 10000;
    const n = 24;
    const taxa = 3.0;
    const pmt = motorLib.calcularPMT(pv, taxa, n);
    
    // PMT exato: 10000 * 0.03 * (1.03^24) / (1.03^24 - 1) = 590.47417...
    assertQuaseIgual(pmt, 590.47, 0.01, "Parcela mensal deve ser aproximadamente R$ 590,47");

    const cronograma = motorLib.gerarCronogramaPrice(pv, taxa, n, "2024-01-10");
    assertIgual(cronograma.parcelas.length, 24, "Devem ser geradas 24 parcelas");
    assertQuaseIgual(cronograma.totalAmortizacao, 10000.0, 0.001, "Soma das amortizações deve ser exatamente R$ 10.000,00");
    assertQuaseIgual(cronograma.saldoFinal, 0.0, 0.0001, "Saldo devedor final deve ser zero");
    assertQuaseIgual(cronograma.totalPago, 590.474 * 24, 0.5, "Total pago consistente");
  });

  // -------------------------------------------------------------
  // Teste 2: Conversão de Taxas Equivalentes (Mensal <-> Anual)
  // 3,00% a.m. -> (1.03)^12 - 1 = 42.576% a.a.
  // -------------------------------------------------------------
  testar("2. Conversão de Taxas Equivalentes (3% a.m. <-> 42,576% a.a.)", function() {
    const anual = motorLib.taxaMensalParaAnual(3.0);
    assertQuaseIgual(anual, 42.576, 0.01, "3% ao mês deve equivaler a 42,576% ao ano");

    const mensal = motorLib.taxaAnualParaMensal(anual);
    assertQuaseIgual(mensal, 3.0, 0.0001, "Conversão inversa anual para mensal deve retornar exatamente 3%");
  });

  // -------------------------------------------------------------
  // Teste 3: Newton-Raphson / Bisseção para Taxa Implícita
  // Dado PV = 10.000, PMT = 590.474, n = 24 -> taxa deve convergir para 3,00%
  // -------------------------------------------------------------
  testar("3. Cálculo Numérico da Taxa Implícita (Newton-Raphson)", function() {
    const pv = 10000;
    const pmt = 590.474;
    const n = 24;
    const taxaCalculada = motorLib.calcularTaxaImplicita(pv, pmt, n);
    assertQuaseIgual(taxaCalculada, 3.0, 0.001, "Taxa implícita deve convergir para 3,00% a.m.");
  });

  // -------------------------------------------------------------
  // Teste 4: Cenários de Recálculo (A, B, C, D) e Repetição do Indébito
  // Contrato: R$ 10.000, 24x, parcela R$ 590,47, taxa 3,00% a.m.
  // Taxa média de mercado: 1,50% a.m.
  // -------------------------------------------------------------
  testar("4. Recálculo em Múltiplos Cenários e Indébito", function() {
    const resultado = motorLib.calcularRevisionalCompleta({
      valorLiberado: 10000,
      prazo: 24,
      valorParcela: 590.47,
      taxaMensalContrato: 3.0,
      taxaMediaMercado: 1.5,
      parcelasPagas: 12,
      tarifas: 0,
      seguro: 0,
      rendaLiquida: 3000,
      config: {
        multiplicador_cenario_b: 1.0,
        multiplicador_cenario_c: 1.5,
        multiplicador_cenario_d: 2.0,
        restituicao_em_dobro: false,
        honorarios_contratuais_perc: 20.0
      }
    });

    // Cenário B (taxa média de 1,50% a.m.):
    // PMT esperado para 10.000 em 24x a 1,50% = 499.24
    const cenarioB = resultado.cenarios.B;
    assertQuaseIgual(cenarioB.novaParcela, 499.24, 0.1, "Nova parcela no Cenário B deve ser ~ R$ 499,24");
    assertQuaseIgual(cenarioB.reducaoParcela, 590.47 - 499.24, 0.1, "Redução de parcela no Cenário B correta");
    assertQuaseIgual(cenarioB.indebitoSimples, (590.47 - 499.24) * 12, 1.5, "Indébito simples de 12 parcelas correto");
    assertQuaseIgual(cenarioB.indebitoEmDobro, cenarioB.indebitoSimples * 2, 0.01, "Indébito em dobro correto");

    // Cenário C (limite STJ de 1,5x a média = 2,25% a.m.):
    const cenarioC = resultado.cenarios.C;
    assertQuaseIgual(cenarioC.taxaAplicadaMensal, 2.25, 0.001, "Taxa do Cenário C deve ser 2,25% a.m.");
    assertQuaseIgual(cenarioC.novaParcela, 543.71, 0.1, "Nova parcela no Cenário C deve ser ~ R$ 543,71");
  });

  // -------------------------------------------------------------
  // Teste 5: Expurgo de Tarifas e Seguros (Cenário E)
  // R$ 10.000 liberado com R$ 800 de tarifas e R$ 700 de seguro
  // Valor base expurgado = R$ 8.500
  // -------------------------------------------------------------
  testar("5. Expurgo de Tarifas e Seguros (Cenário E)", function() {
    const resultado = motorLib.calcularRevisionalCompleta({
      valorLiberado: 10000,
      prazo: 24,
      valorParcela: 590.47,
      taxaMensalContrato: 3.0,
      taxaMediaMercado: 2.0,
      parcelasPagas: 6,
      tarifas: 800,
      seguro: 700,
      rendaLiquida: 4000
    });

    const cenarioE = resultado.cenarios.E;
    assertIgual(cenarioE.valorBaseFinanciado, 8500, "Valor base deve ser R$ 8.500 após expurgo de R$ 1.500");
    // PMT com PV=8500, 24x a 3% = 8500 * 0.059047 = 501.90
    assertQuaseIgual(cenarioE.novaParcela, 501.90, 0.1, "Parcela após expurgo deve ser ~ R$ 501,90");
    assertQuaseIgual(cenarioE.reducaoParcela, 590.47 - 501.90, 0.1, "Redução de parcela por expurgo correta");
  });

  // -------------------------------------------------------------
  // Teste 6: Semáforo de Viabilidade (Verde, Amarelo, Vermelho)
  // -------------------------------------------------------------
  testar("6. Semáforo de Viabilidade", function() {
    // Caso 1: Taxa 6.0% com média 2.5% (Razão 2.4x >= 2.0x) -> VERDE
    const semVerde = motorLib.avaliarSemaforo({
      taxaContrato: 6.0,
      taxaMedia: 2.5,
      totalExpurgos: 0,
      cenarioC: { proveitoTotalEstimado: 5000 }
    });
    assertIgual(semVerde.cor, "VERDE", "Taxa 2.4x a média deve ser classificada como VERDE");

    // Caso 2: Taxa 4.0% com média 2.5% (Razão 1.6x entre 1.5x e 2.0x) -> AMARELO
    const semAmarelo = motorLib.avaliarSemaforo({
      taxaContrato: 4.0,
      taxaMedia: 2.5,
      totalExpurgos: 0,
      cenarioC: { proveitoTotalEstimado: 1200 }
    });
    assertIgual(semAmarelo.cor, "AMARELO", "Taxa 1.6x a média deve ser classificada como AMARELO");

    // Caso 3: Taxa 3.0% com média 2.5% (Razão 1.2x < 1.5x e sem tarifas) -> VERMELHO
    const semVermelho = motorLib.avaliarSemaforo({
      taxaContrato: 3.0,
      taxaMedia: 2.5,
      totalExpurgos: 0,
      cenarioC: { proveitoTotalEstimado: 200 }
    });
    assertIgual(semVermelho.cor, "VERMELHO", "Taxa 1.2x a média deve ser classificada como VERMELHO");
  });

  // -------------------------------------------------------------
  // Teste 7: Alerta Informativo de Comprometimento de Renda
  // Parcela R$ 590,47 sobre Renda Líquida R$ 1.500 -> 39,36% (alerta ativado > 30%)
  // -------------------------------------------------------------
  testar("7. Alerta de Comprometimento de Renda", function() {
    const res = motorLib.calcularRevisionalCompleta({
      valorLiberado: 10000,
      prazo: 24,
      valorParcela: 590.47,
      taxaMensalContrato: 3.0,
      taxaMediaMercado: 2.0,
      rendaLiquida: 1500
    });

    assertIgual(res.alertaComprometimento.ultrapassouLimite, true, "Deve emitir alerta para comprometimento > 30%");
    assertQuaseIgual(res.alertaComprometimento.percentualComprometimento, 39.36, 0.1, "Comprometimento deve ser ~ 39,36%");
  });

  // -------------------------------------------------------------
  // Teste 8: Cronogramas Alternativos (SAC e Gauss)
  // -------------------------------------------------------------
  testar("8. Sistemas Alternativos de Amortização (SAC e Gauss)", function() {
    const sac = motorLib.gerarCronogramaSAC(10000, 3.0, 24);
    assertIgual(sac.metodo, "SAC", "Método deve ser SAC");
    assertQuaseIgual(sac.totalAmortizacao, 10000.0, 0.001, "Soma de amortização no SAC deve ser 10.000");
    assertQuaseIgual(sac.saldoFinal, 0.0, 0.001, "Saldo final no SAC deve ser zero");
    // Primeira parcela SAC: amortização (10000/24 = 416.67) + juros (10000 * 3% = 300) = 716.67
    assertQuaseIgual(sac.primeiraParcela, 716.67, 0.01, "Primeira parcela do SAC correta");

    const gauss = motorLib.gerarCronogramaGauss(10000, 3.0, 24);
    assertIgual(gauss.metodo, "GAUSS", "Método deve ser GAUSS");
    assertQuaseIgual(gauss.totalAmortizacao, 10000.0, 0.001, "Soma de amortização no Gauss deve ser 10.000");
    assertQuaseIgual(gauss.saldoFinal, 0.0, 0.001, "Saldo final no Gauss deve ser zero");
  });

  const resumo = {
    total: resultados.length,
    passaram: passaram,
    falharam: falharam,
    sucesso: falharam === 0,
    resultados: resultados
  };

  return resumo;
}

// Execução automática quando rodado diretamente via Node.js
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  console.log("\n========================================================");
  console.log("🚀 EXECUTANDO SUITE DE TESTES UNITÁRIOS REVISIONAL (V8/NODE)");
  console.log("========================================================\n");
  const relatorio = executarTestesUnitarios();
  console.log("\n--------------------------------------------------------");
  console.log("📊 RESULTADO FINAL: " + relatorio.passaram + "/" + relatorio.total + " passaram (" + (relatorio.sucesso ? "100% SUCESSO" : "COM FALHAS") + ")");
  console.log("--------------------------------------------------------\n");
  if (!relatorio.sucesso) {
    process.exit(1);
  }
}
