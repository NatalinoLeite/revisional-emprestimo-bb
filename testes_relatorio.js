/**
 * @file testes_relatorio.js
 * @description Suite de testes para a geração e formatação de relatórios em PDF.
 */

const rel = require("./relatorio.gs");

function assert(cond, msg) {
  if (!cond) throw new Error("FALHA: " + msg);
}

function testarRelatorio() {
  console.log("\n========================================================");
  console.log("📄 EXECUTANDO TESTES DO MÓDULO DE RELATÓRIO (FASE 5)");
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

  // 1. Mascaramento de dados sensíveis (LGPD)
  executar("1. Mascaramento de CPF e CNPJ para proteção de privacidade", () => {
    assert(rel.mascararDocumento("123.456.789-00") === "123.***.***-00", "CPF mascarado");
    assert(rel.mascararDocumento("12345678900") === "123.***.***-00", "CPF numérico mascarado");
    assert(rel.mascararDocumento("12.345.678/0001-99") === "12.***.***/****-99", "CNPJ mascarado");
  });

  // 2. Formatação brasileira de datas e moedas
  executar("2. Formatação de data (DD/MM/AAAA) e moeda (R$ 1.234,56)", () => {
    assert(rel.formatarDataBR("2024-01-15") === "15/01/2024", "Data formatada");
    assert(rel.formatarMoeda(10000.50) === "R$ 10.000,50", "Moeda formatada com milhar e centavos");
    assert(rel.formatarMoeda(590.47) === "R$ 590,47", "Moeda parcela formatada");
  });

  // 3. Estrutura do payload e geração do relatório
  executar("3. Orquestração da geração de relatório pericial PDF", () => {
    const payload = {
      cliente: { nome: "Carlos Eduardo da Silva", cpf: "123.456.789-00" },
      dadosContrato: {
        banco: "BCO DO BRASIL S.A.",
        modalidade: "Crédito pessoal não consignado - Prefixado",
        valorLiberado: 10000,
        prazo: 24,
        valorParcela: 590.47,
        taxaImplicitaMensal: 3.0,
        taxaMediaBCBMensal: 1.5,
        razaoTaxaMercado: 2.0
      },
      resultado: {
        semaforo: { cor: "VERDE", titulo: "Alta Viabilidade Revisional", explicacao: "Taxa abusiva." },
        cenarios: {
          A: { novaParcela: 590.47, taxaAplicadaMensal: 3.0 },
          B: { novaParcela: 499.24, taxaAplicadaMensal: 1.5, reducaoParcela: 91.23, indebitoAplicado: 1094.76, proveitoTotalEstimado: 2189.52, liquidoCliente: 1751.62 },
          C: { novaParcela: 543.71, taxaAplicadaMensal: 2.25, reducaoParcela: 46.76, indebitoAplicado: 561.12, proveitoTotalEstimado: 1122.24, liquidoCliente: 897.79 }
        }
      }
    };

    const res = rel.gerarRelatorioRevisionalPDF(payload);
    assert(res.pdfUrl.includes("drive.google.com"), "Deve retornar URL do Google Drive");
    assert(res.nomeArquivo.includes(".pdf"), "Extensão do arquivo deve ser .pdf");
  });

  console.log("\n--------------------------------------------------------");
  console.log("📊 RESULTADO DOS TESTES DE RELATÓRIO: " + passaram + "/" + (passaram + falharam) + " passaram (" + (falharam === 0 ? "100% SUCESSO" : "COM FALHAS") + ")");
  console.log("--------------------------------------------------------\n");

  if (falharam > 0) process.exit(1);
}

testarRelatorio();
