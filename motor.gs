/**
 * @file motor.gs
 * @description Motor de cálculo financeiro e determinístico para revisional de empréstimos bancários.
 * Funções puras, auditáveis e sem dependências externas (sem acesso à planilha ou DOM).
 */

/**
 * Converte taxa mensal para taxa anual equivalente no regime de juros compostos.
 * Fórmula: (1 + i_mensal)^12 - 1
 * @param {number} taxaMensal - Taxa mensal em porcentagem (ex.: 3.0 para 3%).
 * @returns {number} Taxa anual equivalente em porcentagem.
 */
function taxaMensalParaAnual(taxaMensal) {
  if (taxaMensal === 0) return 0;
  const im = taxaMensal / 100;
  const ia = Math.pow(1 + im, 12) - 1;
  return ia * 100;
}

/**
 * Converte taxa anual para taxa mensal equivalente no regime de juros compostos.
 * Fórmula: (1 + i_anual)^(1/12) - 1
 * @param {number} taxaAnual - Taxa anual em porcentagem (ex.: 42.57 para 42.57%).
 * @returns {number} Taxa mensal equivalente em porcentagem.
 */
function taxaAnualParaMensal(taxaAnual) {
  if (taxaAnual === 0) return 0;
  const ia = taxaAnual / 100;
  const im = Math.pow(1 + ia, 1 / 12) - 1;
  return im * 100;
}

/**
 * Converte taxa nominal anual para taxa efetiva anual dada a frequência de capitalização.
 * Fórmula: (1 + i_nom / p)^p - 1
 * @param {number} taxaNominal - Taxa nominal em porcentagem.
 * @param {number} periodos - Número de capitalizações no período (ex.: 12 para mensal).
 * @returns {number} Taxa efetiva em porcentagem.
 */
function taxaNominalParaEfetiva(taxaNominal, periodos) {
  if (periodos <= 0) throw new Error("O número de períodos deve ser maior que zero.");
  const i = (taxaNominal / 100) / periodos;
  const efetiva = Math.pow(1 + i, periodos) - 1;
  return efetiva * 100;
}

/**
 * Calcula o valor da prestação periódica (PMT) pelo Sistema Francês de Amortização (Tabela Price).
 * Fórmula: PMT = PV * [i * (1 + i)^n] / [(1 + i)^n - 1]
 * @param {number} pv - Valor presente / financiado líquido.
 * @param {number} taxaMensal - Taxa de juros mensal em porcentagem (ex.: 3.0 para 3%).
 * @param {number} n - Quantidade total de parcelas.
 * @returns {number} Valor da parcela (PMT).
 */
function calcularPMT(pv, taxaMensal, n) {
  if (pv <= 0 || n <= 0) return 0;
  if (taxaMensal === 0) return pv / n;
  
  const i = taxaMensal / 100;
  const fator = Math.pow(1 + i, n);
  const pmt = pv * (i * fator) / (fator - 1);
  return pmt;
}

/**
 * Calcula a taxa de juros implícita do contrato a partir do valor liberado, parcela e prazo.
 * Utiliza o método híbrido de Newton-Raphson com salvaguarda por Bisseção.
 * @param {number} pv - Valor presente / financiado.
 * @param {number} pmt - Valor da parcela cobrada.
 * @param {number} n - Número total de parcelas.
 * @param {number} [palpiteInicial=0.03] - Estimativa inicial para o método numérico (ex.: 0.03 para 3%).
 * @returns {number} Taxa mensal implícita calculada em porcentagem (ex.: 3.0 para 3%).
 */
function calcularTaxaImplicita(pv, pmt, n, palpiteInicial) {
  if (pv <= 0 || pmt <= 0 || n <= 0) {
    throw new Error("Parâmetros inválidos para cálculo da taxa implícita.");
  }
  
  // Se o total pago for exatamente igual ao PV, a taxa é zero
  if (Math.abs(pmt * n - pv) < 0.001) return 0;
  if (pmt * n < pv) {
    throw new Error("A soma das parcelas é menor que o valor financiado. Taxa negativa.");
  }

  const tolerancia = 1e-8;
  const maxIteracoesNewton = 50;
  
  // Função f(i) = pmt * [1 - (1 + i)^(-n)] / i - pv = 0
  function f(i) {
    if (Math.abs(i) < 1e-12) return pmt * n - pv;
    return pmt * (1 - Math.pow(1 + i, -n)) / i - pv;
  }

  // Derivada f'(i) em relação à taxa i
  function fDerivada(i) {
    const umMaisI = 1 + i;
    const fatorN = Math.pow(umMaisI, -n);
    const termo1 = pmt * n * Math.pow(umMaisI, -n - 1) / i;
    const termo2 = pmt * (1 - fatorN) / (i * i);
    return termo1 - termo2;
  }

  // Tentativa 1: Newton-Raphson
  let i = palpiteInicial && palpiteInicial > 0 ? palpiteInicial : 0.03;
  let convergiu = false;

  for (let iter = 0; iter < maxIteracoesNewton; iter++) {
    const y = f(i);
    const dy = fDerivada(i);
    
    if (Math.abs(dy) < 1e-12) break; // Derivada muito próxima de zero, migra para bisseção
    
    const proximoI = i - y / dy;
    if (proximoI <= 0 || isNaN(proximoI)) break; // Fora do domínio financeiro aceitável

    if (Math.abs(proximoI - i) < tolerancia) {
      i = proximoI;
      convergiu = true;
      break;
    }
    i = proximoI;
  }

  // Tentativa 2: Bisseção como salvaguarda absoluta
  if (!convergiu) {
    let a = 0.000001; // 0.0001% a.m.
    let b = 10.0;     // 1000% a.m.
    
    for (let iter = 0; iter < 100; iter++) {
      const meio = (a + b) / 2;
      const fMeio = f(meio);

      if (Math.abs(fMeio) < tolerancia || (b - a) / 2 < tolerancia) {
        i = meio;
        convergiu = true;
        break;
      }

      if (Math.sign(fMeio) === Math.sign(f(a))) {
        a = meio;
      } else {
        b = meio;
      }
    }
  }

  return i * 100;
}

/**
 * Gera o cronograma completo de amortização pelo Sistema Francês (Tabela Price).
 * Realiza o ajuste fino de resíduo de centavos na última parcela para zerar o saldo final.
 * @param {number} pv - Valor presente financiado.
 * @param {number} taxaMensal - Taxa mensal em porcentagem.
 * @param {number} n - Número de parcelas.
 * @param {string|Date} [dataPrimeiraParcela] - Data de vencimento da primeira parcela.
 * @returns {Object} Contendo lista de parcelas, totais acumulados e conferência.
 */
function gerarCronogramaPrice(pv, taxaMensal, n, dataPrimeiraParcela) {
  if (pv <= 0 || n <= 0) {
    throw new Error("Valor financiado e número de parcelas devem ser positivos.");
  }

  const pmtTeorico = calcularPMT(pv, taxaMensal, n);
  const taxaDecimal = taxaMensal / 100;
  
  let saldoDevedor = pv;
  let totalJuros = 0;
  let totalAmortizacao = 0;
  let totalPago = 0;
  const parcelas = [];

  const dataBase = dataPrimeiraParcela ? new Date(dataPrimeiraParcela) : new Date();

  for (let k = 1; k <= n; k++) {
    const dataVenc = new Date(dataBase.getFullYear(), dataBase.getMonth() + (k - 1), dataBase.getDate());
    
    const jurosParcela = saldoDevedor * taxaDecimal;
    let amortizacaoParcela = pmtTeorico - jurosParcela;
    let valorParcela = pmtTeorico;

    // Ajuste final na última parcela para liquidação exata
    if (k === n) {
      amortizacaoParcela = saldoDevedor;
      valorParcela = amortizacaoParcela + jurosParcela;
      saldoDevedor = 0;
    } else {
      saldoDevedor -= amortizacaoParcela;
    }

    totalJuros += jurosParcela;
    totalAmortizacao += amortizacaoParcela;
    totalPago += valorParcela;

    parcelas.push({
      numero: k,
      dataVencimento: formatarDataISO(dataVenc),
      pmt: valorParcela,
      juros: jurosParcela,
      amortizacao: amortizacaoParcela,
      saldoDevedor: Math.max(0, saldoDevedor)
    });
  }

  return {
    metodo: "PRICE",
    valorFinanciado: pv,
    taxaMensal: taxaMensal,
    prazo: n,
    pmtPadrao: pmtTeorico,
    totalPago: totalPago,
    totalJuros: totalJuros,
    totalAmortizacao: totalAmortizacao,
    saldoFinal: 0,
    parcelas: parcelas
  };
}

/**
 * Gera cronograma pelo Sistema de Amortização Constante (SAC).
 * @param {number} pv - Valor presente financiado.
 * @param {number} taxaMensal - Taxa mensal em porcentagem.
 * @param {number} n - Número de parcelas.
 * @param {string|Date} [dataPrimeiraParcela] - Data da primeira parcela.
 * @returns {Object} Cronograma SAC.
 */
function gerarCronogramaSAC(pv, taxaMensal, n, dataPrimeiraParcela) {
  if (pv <= 0 || n <= 0) throw new Error("Parâmetros inválidos para SAC.");

  const amortizacaoConstante = pv / n;
  const taxaDecimal = taxaMensal / 100;
  let saldoDevedor = pv;
  let totalJuros = 0;
  let totalAmortizacao = 0;
  let totalPago = 0;
  const parcelas = [];
  const dataBase = dataPrimeiraParcela ? new Date(dataPrimeiraParcela) : new Date();

  for (let k = 1; k <= n; k++) {
    const dataVenc = new Date(dataBase.getFullYear(), dataBase.getMonth() + (k - 1), dataBase.getDate());
    const jurosParcela = saldoDevedor * taxaDecimal;
    const valorParcela = amortizacaoConstante + jurosParcela;
    
    saldoDevedor -= amortizacaoConstante;
    if (k === n) saldoDevedor = 0;

    totalJuros += jurosParcela;
    totalAmortizacao += amortizacaoConstante;
    totalPago += valorParcela;

    parcelas.push({
      numero: k,
      dataVencimento: formatarDataISO(dataVenc),
      pmt: valorParcela,
      juros: jurosParcela,
      amortizacao: amortizacaoConstante,
      saldoDevedor: Math.max(0, saldoDevedor)
    });
  }

  return {
    metodo: "SAC",
    valorFinanciado: pv,
    taxaMensal: taxaMensal,
    prazo: n,
    primeiraParcela: parcelas[0].pmt,
    ultimaParcela: parcelas[n - 1].pmt,
    totalPago: totalPago,
    totalJuros: totalJuros,
    totalAmortizacao: totalAmortizacao,
    saldoFinal: 0,
    parcelas: parcelas
  };
}

/**
 * Gera cronograma pelo Método de Gauss (Juros Simples / Ponderação linear).
 * Utilizado como tese alternativa em algumas perícias contábeis revisionais.
 * @param {number} pv - Valor presente financiado.
 * @param {number} taxaMensal - Taxa mensal em porcentagem.
 * @param {number} n - Número de parcelas.
 * @param {string|Date} [dataPrimeiraParcela] - Data da primeira parcela.
 * @returns {Object} Cronograma Gauss.
 */
function gerarCronogramaGauss(pv, taxaMensal, n, dataPrimeiraParcela) {
  if (pv <= 0 || n <= 0) throw new Error("Parâmetros inválidos para Gauss.");

  const i = taxaMensal / 100;
  // Juros totais simples: J_total = PV * i * (n + 1) / 2
  const jurosTotais = pv * i * (n + 1) / 2;
  const montanteTotal = pv + jurosTotais;
  const pmtGauss = montanteTotal / n;
  const amortizacaoConstante = pv / n;
  const jurosParcela = jurosTotais / n;

  let saldoDevedor = pv;
  let totalJuros = 0;
  let totalAmortizacao = 0;
  let totalPago = 0;
  const parcelas = [];
  const dataBase = dataPrimeiraParcela ? new Date(dataPrimeiraParcela) : new Date();

  for (let k = 1; k <= n; k++) {
    const dataVenc = new Date(dataBase.getFullYear(), dataBase.getMonth() + (k - 1), dataBase.getDate());
    saldoDevedor -= amortizacaoConstante;
    if (k === n) saldoDevedor = 0;

    totalJuros += jurosParcela;
    totalAmortizacao += amortizacaoConstante;
    totalPago += pmtGauss;

    parcelas.push({
      numero: k,
      dataVencimento: formatarDataISO(dataVenc),
      pmt: pmtGauss,
      juros: jurosParcela,
      amortizacao: amortizacaoConstante,
      saldoDevedor: Math.max(0, saldoDevedor)
    });
  }

  return {
    metodo: "GAUSS",
    valorFinanciado: pv,
    taxaMensal: taxaMensal,
    prazo: n,
    pmtPadrao: pmtGauss,
    totalPago: totalPago,
    totalJuros: totalJuros,
    totalAmortizacao: totalAmortizacao,
    saldoFinal: 0,
    parcelas: parcelas
  };
}

/**
 * Executa o recálculo completo do contrato em todos os cenários determinísticos (A, B, C, D e E).
 * 
 * Cenários:
 * - Cenário A: Contrato original (como pactuado)
 * - Cenário B: Taxa limitada à média de mercado do BCB (1,0x)
 * - Cenário C: Taxa limitada a 1,5x a média de mercado do BCB (padrão jurisprudencial STJ)
 * - Cenário D: Taxa limitada a 2,0x a média de mercado do BCB (abusividade grave)
 * - Cenário E: Expurgo de tarifas/seguros indevidos (recálculo sobre o valor liberado líquido)
 * 
 * @param {Object} params - Dados de entrada do contrato e configurações.
 * @param {number} params.valorLiberado - Valor liberado/financiado em R$.
 * @param {number} params.prazo - Prazo total em meses.
 * @param {number} params.valorParcela - Valor da parcela cobrada pelo banco em R$.
 * @param {number} params.taxaMensalContrato - Taxa mensal declarada no contrato (% a.m.).
 * @param {number} params.taxaMediaMercado - Taxa média de mercado obtida no BCB (% a.m.).
 * @param {number} [params.parcelasPagas=0] - Quantidade de parcelas já quitadas pelo cliente.
 * @param {number} [params.tarifas=0] - Soma de tarifas questionadas (ex.: TAC, TEC, cadastro, registro).
 * @param {number} [params.seguro=0] - Seguro prestamista questionado.
 * @param {number} [params.rendaLiquida=0] - Renda líquida mensal do cliente para aferição de comprometimento.
 * @param {string} [params.dataContrato] - Data da celebração do contrato (YYYY-MM-DD).
 * @param {string} [params.dataPrimeiraParcela] - Data do primeiro vencimento (YYYY-MM-DD).
 * @param {Object} [params.config] - Configurações de recálculo (multiplicadores, índices, honorários).
 * @returns {Object} Relatório analítico completo com todos os cenários e semáforo de viabilidade.
 */
function calcularRevisionalCompleta(params) {
  const pv = Number(params.valorLiberado) || 0;
  const n = Number(params.prazo) || 0;
  const pmtOriginal = Number(params.valorParcela) || 0;
  const taxaDeclarada = Number(params.taxaMensalContrato) || 0;
  const taxaMedia = Number(params.taxaMediaMercado) || 0;
  const parcelasPagas = Math.min(n, Math.max(0, Number(params.parcelasPagas) || 0));
  const tarifas = Math.max(0, Number(params.tarifas) || 0);
  const seguro = Math.max(0, Number(params.seguro) || 0);
  const totalExpurgos = tarifas + seguro;
  const rendaLiquida = Math.max(0, Number(params.rendaLiquida) || 0);

  const cfg = params.config || {};
  const multB = cfg.multiplicador_cenario_b !== undefined ? Number(cfg.multiplicador_cenario_b) : 1.0;
  const multC = cfg.multiplicador_cenario_c !== undefined ? Number(cfg.multiplicador_cenario_c) : 1.5;
  const multD = cfg.multiplicador_cenario_d !== undefined ? Number(cfg.multiplicador_cenario_d) : 2.0;
  const jurosMoraMensal = cfg.juros_mora_mensal !== undefined ? Number(cfg.juros_mora_mensal) : 1.0;
  const honorariosPerc = cfg.honorarios_contratuais_perc !== undefined ? Number(cfg.honorarios_contratuais_perc) : 20.0;
  const honorariosSucumbencia = cfg.honorarios_sucumbenciais_perc !== undefined ? Number(cfg.honorarios_sucumbenciais_perc) : 10.0;
  const dobroIndebito = cfg.restituicao_em_dobro === true;

  if (pv <= 0 || n <= 0 || pmtOriginal <= 0) {
    throw new Error("Dados obrigatórios inválidos: valorLiberado, prazo e valorParcela devem ser maiores que zero.");
  }

  // 1. Taxa Implícita e Verificação de Inconsistência
  const taxaImplicita = calcularTaxaImplicita(pv, pmtOriginal, n, taxaDeclarada / 100);
  const diferencaTaxas = Math.abs(taxaImplicita - taxaDeclarada);
  const taxaInconsistente = taxaDeclarada > 0 && diferencaTaxas > 0.05;

  // 2. Cronograma Original (Cenário A)
  const cronogramaOriginal = gerarCronogramaPrice(pv, taxaImplicita, n, params.dataPrimeiraParcela);

  // 3. Função auxiliar para calcular métricas de um cenário
  function simularCenario(id, nome, taxaTeto, valorBase, descricao) {
    const taxaAplicada = taxaTeto > 0 ? Math.min(taxaImplicita, taxaTeto) : taxaImplicita;
    const novoPmt = calcularPMT(valorBase, taxaAplicada, n);
    const cronograma = gerarCronogramaPrice(valorBase, taxaAplicada, n, params.dataPrimeiraParcela);
    
    // Diferença mensal por parcela
    const reducaoParcela = Math.max(0, pmtOriginal - novoPmt);
    const reducaoPercentual = pmtOriginal > 0 ? (reducaoParcela / pmtOriginal) * 100 : 0;
    
    // Apuração sobre parcelas pagas
    const pagoOriginal = pmtOriginal * parcelasPagas;
    const devidoRecalculado = novoPmt * parcelasPagas;
    const indébitoSimples = Math.max(0, pagoOriginal - devidoRecalculado);
    const indébitoAplicado = dobroIndebito ? indébitoSimples * 2 : indébitoSimples;

    // Saldo devedor atual (após as parcelas pagas)
    const saldoOriginalAtual = parcelasPagas > 0 && parcelasPagas < n ? cronogramaOriginal.parcelas[parcelasPagas - 1].saldoDevedor : (parcelasPagas === 0 ? pv : 0);
    const saldoRecalculadoAtual = parcelasPagas > 0 && parcelasPagas < n ? cronograma.parcelas[parcelasPagas - 1].saldoDevedor : (parcelasPagas === 0 ? valorBase : 0);
    const reducaoSaldoDevedor = Math.max(0, saldoOriginalAtual - saldoRecalculadoAtual);

    // Economia futura nas parcelas vincendas
    const parcelasVincendas = n - parcelasPagas;
    const economiaFutura = reducaoParcela * parcelasVincendas;

    // Proveito econômico total estimado
    const proveitoTotalEstimado = indébitoAplicado + reducaoSaldoDevedor;

    // Líquido do cliente após honorários contratuais
    const honorariosValor = proveitoTotalEstimado * (honorariosPerc / 100);
    const liquidoCliente = Math.max(0, proveitoTotalEstimado - honorariosValor);

    return {
      id: id,
      nome: nome,
      descricao: descricao,
      taxaAplicadaMensal: taxaAplicada,
      taxaAplicadaAnual: taxaMensalParaAnual(taxaAplicada),
      valorBaseFinanciado: valorBase,
      novaParcela: novoPmt,
      reducaoParcela: reducaoParcela,
      reducaoPercentual: reducaoPercentual,
      totalDevidoContrato: cronograma.totalPago,
      totalEconomiaContrato: Math.max(0, cronogramaOriginal.totalPago - cronograma.totalPago),
      parcelasPagas: parcelasPagas,
      indebitoSimples: indébitoSimples,
      indebitoEmDobro: indébitoSimples * 2,
      indebitoAplicado: indébitoAplicado,
      restituicaoEmDobroAtiva: dobroIndebito,
      saldoDevedorOriginal: saldoOriginalAtual,
      saldoDevedorRecalculado: saldoRecalculadoAtual,
      reducaoSaldoDevedor: reducaoSaldoDevedor,
      economiaFutura: economiaFutura,
      proveitoTotalEstimado: proveitoTotalEstimado,
      honorariosEstimados: honorariosValor,
      liquidoCliente: liquidoCliente,
      cronogramaResumido: {
        primeirasTres: cronograma.parcelas.slice(0, 3),
        ultimasDuas: cronograma.parcelas.slice(-2)
      }
    };
  }

  // 4. Construção dos Cenários
  const taxaCenarioB = taxaMedia * multB;
  const taxaCenarioC = taxaMedia * multC;
  const taxaCenarioD = taxaMedia * multD;

  const cenarioA = simularCenario(
    "A",
    "Contrato Original",
    taxaImplicita,
    pv,
    "Condições pactuadas no contrato (sem alteração de taxa ou expurgo)."
  );

  const cenarioB = simularCenario(
    "B",
    "Taxa Média de Mercado (" + multB.toFixed(1) + "x)",
    taxaCenarioB,
    pv,
    "Substituição dos juros pela taxa média de mercado apurada pelo Banco Central."
  );

  const cenarioC = simularCenario(
    "C",
    "Critério Jurisprudencial STJ (" + multC.toFixed(1) + "x)",
    taxaCenarioC,
    pv,
    "Limitação a 1,5x a taxa média, patamar de tolerância amplamente utilizado nos Tribunais de Justiça."
  );

  const cenarioD = simularCenario(
    "D",
    "Abusividade Qualificada (" + multD.toFixed(1) + "x)",
    taxaCenarioD,
    pv,
    "Limitação a 2,0x a média de mercado, caracterizando vantagem manifestamente excessiva."
  );

  // Cenário E: Expurgo de Tarifas e Seguros
  const valorBaseExpurgado = Math.max(0, pv - totalExpurgos);
  const cenarioE = simularCenario(
    "E",
    "Expurgo de Tarifas e Seguros",
    taxaImplicita,
    valorBaseExpurgado,
    "Expurgo de tarifas acessórias (TAC/cadastro) e seguro prestamista abusivo, recalculando o valor líquido."
  );

  // Cenário Combinado: Taxa Média (B) + Expurgo (E)
  const cenarioCombinado = simularCenario(
    "COMBINADO",
    "Taxa Média + Expurgo de Tarifas",
    taxaCenarioB,
    valorBaseExpurgado,
    "Cenário mais favorável: aplicação da taxa média do BCB cumulada com o abatimento das tarifas ilegais."
  );

  // 5. Avaliação do Semáforo de Viabilidade
  const semaforo = avaliarSemaforo({
    taxaContrato: taxaImplicita,
    taxaMedia: taxaMedia,
    totalExpurgos: totalExpurgos,
    cenarioC: cenarioC,
    cenarioB: cenarioB,
    cenarioCombinado: cenarioCombinado,
    config: cfg
  });

  // 6. Alerta de Comprometimento de Renda
  let alertaComprometimento = null;
  if (rendaLiquida > 0) {
    const percComprometimento = (pmtOriginal / rendaLiquida) * 100;
    const limiteAlerta = cfg.comprometimento_renda_alerta || 30.0;
    alertaComprometimento = {
      rendaLiquida: rendaLiquida,
      parcelaAtual: pmtOriginal,
      percentualComprometimento: percComprometimento,
      limiteAlerta: limiteAlerta,
      ultrapassouLimite: percComprometimento > limiteAlerta,
      mensagem: percComprometimento > limiteAlerta
        ? "ALERTA: A parcela atual consome " + percComprometimento.toFixed(1) + "% da renda líquida informada (superior ao limite prudencial de " + limiteAlerta + "%). Recomenda-se arguição de superendividamento."
        : "A parcela compromete " + percComprometimento.toFixed(1) + "% da renda líquida (dentro do patamar de " + limiteAlerta + "%)."
    };
  }

  return {
    dadosContrato: {
      valorLiberado: pv,
      prazo: n,
      valorParcela: pmtOriginal,
      taxaDeclaradaMensal: taxaDeclarada,
      taxaDeclaradaAnual: taxaMensalParaAnual(taxaDeclarada),
      taxaImplicitaMensal: taxaImplicita,
      taxaImplicitaAnual: taxaMensalParaAnual(taxaImplicita),
      taxaInconsistente: taxaInconsistente,
      diferencaTaxas: diferencaTaxas,
      taxaMediaBCBMensal: taxaMedia,
      taxaMediaBCBAnual: taxaMensalParaAnual(taxaMedia),
      razaoTaxaMercado: taxaMedia > 0 ? taxaImplicita / taxaMedia : 1.0,
      tarifasExpurgadas: tarifas,
      seguroExpurgado: seguro,
      totalExpurgos: totalExpurgos,
      parcelasPagas: parcelasPagas,
      parcelasVincendas: n - parcelasPagas
    },
    alertaComprometimento: alertaComprometimento,
    semaforo: semaforo,
    cenarios: {
      A: cenarioA,
      B: cenarioB,
      C: cenarioC,
      D: cenarioD,
      E: cenarioE,
      COMBINADO: cenarioCombinado
    },
    resumoExecutivo: {
      corSemaforo: semaforo.cor,
      tituloSemaforo: semaforo.titulo,
      justificativaSemaforo: semaforo.explicacao,
      restituicaoEstimada: cenarioC.indebitoAplicado,
      reducaoParcela: cenarioC.reducaoParcela,
      novaParcela: cenarioC.novaParcela,
      saldoDevedorReduzido: cenarioC.reducaoSaldoDevedor,
      proveitoEconomicoTotal: cenarioC.proveitoTotalEstimado,
      liquidoClienteAposHonorarios: cenarioC.liquidoCliente
    }
  };
}

/**
 * Avalia a viabilidade jurídica/financeira da demanda revisional segundo regras configuráveis (Semáforo).
 * @param {Object} dados - Contém taxa do contrato, média, expurgos e cenários calculados.
 * @returns {Object} { cor: "VERDE"|"AMARELO"|"VERMELHO", titulo, explicacao, confianca }
 */
function avaliarSemaforo(dados) {
  const taxaContrato = dados.taxaContrato;
  const taxaMedia = dados.taxaMedia;
  const totalExpurgos = dados.totalExpurgos;
  const cenarioC = dados.cenarioC;
  const cfg = dados.config || {};

  const limVerdeMult = cfg.limite_verde_multiplicador !== undefined ? Number(cfg.limite_verde_multiplicador) : 2.0;
  const limAmareloMult = cfg.limite_amarelo_multiplicador !== undefined ? Number(cfg.limite_amarelo_multiplicador) : 1.5;
  const limRelevanciaReais = cfg.limiar_relevancia_reais !== undefined ? Number(cfg.limiar_relevancia_reais) : 3000.0;

  const razao = taxaMedia > 0 ? taxaContrato / taxaMedia : 1.0;
  const proveitoC = cenarioC ? cenarioC.proveitoTotalEstimado : 0;

  // 1. Caso VERDE: Taxa excessiva (>= 2,0x a média) OU proveito financeiro muito alto
  if (razao >= limVerdeMult || (razao >= limAmareloMult && proveitoC >= limRelevanciaReais)) {
    return {
      cor: "VERDE",
      titulo: "Alta Viabilidade Revisional",
      razao: razao,
      explicacao: "A taxa efetiva do contrato (" + taxaContrato.toFixed(2) + "% a.m.) supera " + razao.toFixed(2) + "x a média de mercado do Banco Central (" + taxaMedia.toFixed(2) + "% a.m.), caracterizando abusividade manifesta segundo a jurisprudência dominante do STJ. O proveito econômico estimado é expressivo (R$ " + proveitoC.toFixed(2) + ").",
      avisoLegal: "Triagem preliminar orientativa baseada em precedentes jurisprudenciais. Não constitui garantia de êxito nem substitui perícia contábil forense."
    };
  }

  // 2. Caso AMARELO: Taxa intermediária (entre 1,5x e 2,0x) OU somente tarifas/seguro expressivos
  if (razao >= limAmareloMult || totalExpurgos >= 500) {
    let motivo = "";
    if (razao >= limAmareloMult) {
      motivo = "A taxa de juros (" + taxaContrato.toFixed(2) + "% a.m.) está " + razao.toFixed(2) + "x acima da média de mercado (" + taxaMedia.toFixed(2) + "% a.m.), situando-se na faixa cinzenta de discricionariedade judicial (1,5x a 2,0x).";
    } else {
      motivo = "A taxa de juros está próxima à média de mercado, mas foram identificadas tarifas acessórias e seguros questionáveis no total de R$ " + totalExpurgos.toFixed(2) + ".";
    }
    return {
      cor: "AMARELO",
      titulo: "Viabilidade Média / Moderada",
      razao: razao,
      explicacao: motivo + " A viabilidade dependerá da orientação do magistrado local e da prova de que os serviços não foram prestados ou foram impostos em venda casada.",
      avisoLegal: "Triagem preliminar orientativa baseada em precedentes jurisprudenciais. Não constitui garantia de êxito nem substitui perícia contábil forense."
    };
  }

  // 3. Caso VERMELHO: Taxa abaixo de 1,5x e sem tarifas relevantes
  return {
    cor: "VERMELHO",
    titulo: "Baixa Viabilidade Revisional",
    razao: razao,
    explicacao: "A taxa praticada (" + taxaContrato.toFixed(2) + "% a.m.) representa apenas " + razao.toFixed(2) + "x a taxa média de mercado do BCB (" + taxaMedia.toFixed(2) + "% a.m.), patamar que a Segunda Seção do Superior Tribunal de Justiça (STJ) pacificamente considera lícito e não abusivo.",
    avisoLegal: "Triagem preliminar orientativa baseada em precedentes jurisprudenciais. Não constitui garantia de êxito nem substitui perícia contábil forense."
  };
}

/**
 * Atualiza valores com correção monetária mês a mês baseada em série histórica de índices (SGS).
 * @param {Array<Object>} itensIndebito - Lista de { data, valor }.
 * @param {Array<Object>} serieIndices - Lista de { data: 'dd/MM/yyyy', valor: '0.42' }.
 * @param {number} taxaJurosMoraMensal - Taxa mensal de juros de mora (ex.: 1.0 para 1%).
 * @param {string|Date} dataFinalCalculo - Data de corte para atualização.
 * @returns {Object} Detalhamento dos valores atualizados.
 */
function aplicarCorrecaoEJuros(itensIndebito, serieIndices, taxaJurosMoraMensal, dataFinalCalculo) {
  if (!itensIndebito || itensIndebito.length === 0) {
    return { totalOriginal: 0, totalCorrigido: 0, totalJurosMora: 0, totalGeral: 0, itens: [] };
  }

  // Indexa a série de índices por anoMes (ex.: "2024-01")
  const mapaIndices = {};
  if (serieIndices && Array.isArray(serieIndices)) {
    serieIndices.forEach(function(item) {
      if (item.data && item.valor) {
        const partes = item.data.split("/");
        if (partes.length === 3) {
          const anoMes = partes[2] + "-" + partes[1];
          mapaIndices[anoMes] = parseFloat(item.valor) / 100;
        }
      }
    });
  }

  const dataFim = dataFinalCalculo ? new Date(dataFinalCalculo) : new Date();
  let totalOriginal = 0;
  let totalCorrigido = 0;
  let totalJuros = 0;
  const resultadoItens = [];

  itensIndebito.forEach(function(item, idx) {
    const valorNominal = Number(item.valor) || 0;
    const dataItem = new Date(item.data);
    totalOriginal += valorNominal;

    // Correção monetária acumulada da data do desembolso até a data final
    let valorAtualizado = valorNominal;
    let dataCursor = new Date(dataItem.getFullYear(), dataItem.getMonth(), 1);

    while (dataCursor < dataFim) {
      const mesStr = String(dataCursor.getMonth() + 1).padStart(2, "0");
      const chaveAnoMes = dataCursor.getFullYear() + "-" + mesStr;
      const fatorMes = mapaIndices[chaveAnoMes] !== undefined ? mapaIndices[chaveAnoMes] : 0;
      valorAtualizado *= (1 + fatorMes);
      dataCursor.setMonth(dataCursor.getMonth() + 1);
    }

    // Juros de mora simples da data do desembolso até a data final (1% ao mês proporcional)
    const mesesDecorridos = Math.max(0, (dataFim.getFullYear() - dataItem.getFullYear()) * 12 + (dataFim.getMonth() - dataItem.getMonth()));
    const jurosMora = valorAtualizado * (taxaJurosMoraMensal / 100) * mesesDecorridos;

    totalCorrigido += valorAtualizado;
    totalJuros += jurosMora;

    resultadoItens.push({
      item: idx + 1,
      dataDesembolso: formatarDataISO(dataItem),
      valorOriginal: valorNominal,
      valorCorrigido: valorAtualizado,
      mesesMora: mesesDecorridos,
      jurosMora: jurosMora,
      totalAtualizado: valorAtualizado + jurosMora
    });
  });

  return {
    totalOriginal: totalOriginal,
    totalCorrigido: totalCorrigido,
    totalJurosMora: totalJuros,
    totalGeral: totalCorrigido + totalJuros,
    itens: resultadoItens
  };
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

// Exportação para ambientes CommonJS / Node.js (testes automatizados locais)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
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
