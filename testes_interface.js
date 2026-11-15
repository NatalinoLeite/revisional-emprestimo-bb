/**
 * @file testes_interface.js
 * @description Teste automatizado de integridade dos componentes da interface HTML/CSS/JS e rotas do Code.gs.
 */

const fs = require("fs");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error("FALHA: " + msg);
}

function testarInterface() {
  console.log("\n========================================================");
  console.log("🖥️ EXECUTANDO TESTES DE INTEGRIDADE DA INTERFACE (FASE 4)");
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

  // 1. Arquivos existem
  executar("1. Existência física dos arquivos do frontend e backend", () => {
    const arquivos = ["index.html", "wizard.html", "css.html", "js.html", "Code.gs"];
    arquivos.forEach(arq => {
      assert(fs.existsSync(arq), "Arquivo " + arq + " deve existir");
    });
  });

  // 2. Elementos essenciais do Wizard
  executar("2. Presença de todos os seletores e IDs do Wizard", () => {
    const wizardHtml = fs.readFileSync("wizard.html", "utf-8");
    const idsEsperados = [
      "step-1-content", "step-2-content", "step-3-content", "step-4-content",
      "busca-cliente-input", "cliente-nome", "cliente-cpf", "cliente-renda",
      "drop-area", "file-input", "contrato-banco", "contrato-modalidade",
      "contrato-valor-liberado", "contrato-prazo", "contrato-valor-parcela",
      "contrato-taxa-mensal", "contrato-tarifa-cadastro", "contrato-seguro",
      "taxa-contrato-badge", "taxa-mercado-badge", "taxa-bb-badge", "taxa-razao-badge",
      "resultado-semaforo-container", "resultado-metricas-container", "tabela-cenarios",
      "grafico-barra-original", "grafico-barra-recalculado", "grafico-barra-economia"
    ];

    idsEsperados.forEach(id => {
      assert(wizardHtml.includes('id="' + id + '"'), "ID '" + id + "' deve estar no wizard.html");
    });
  });

  // 3. Funções no Code.gs
  executar("3. Declaração das rotas e endpoints de API em Code.gs", () => {
    const codeGs = fs.readFileSync("Code.gs", "utf-8");
    const funcoes = [
      "doGet", "include", "obterUsuarioAtual", "buscarClientesEProcessos",
      "apiUploadEExtrairContrato", "apiConsultarTaxasBCB",
      "apiExecutarCalculoRevisional", "apiSalvarRevisional"
    ];

    funcoes.forEach(fn => {
      assert(codeGs.includes("function " + fn), "Função " + fn + " deve estar declarada no Code.gs");
    });
  });

  // 4. Integração do Template Principal (index.html)
  executar("4. Inclusão dos partials no index.html", () => {
    const indexHtml = fs.readFileSync("index.html", "utf-8");
    assert(indexHtml.includes("include('css')"), "index.html deve incluir css");
    assert(indexHtml.includes("include('wizard')"), "index.html deve incluir wizard");
    assert(indexHtml.includes("include('js')"), "index.html deve incluir js");
    assert(indexHtml.includes("spinner-overlay"), "index.html deve conter spinner-overlay");
  });

  console.log("\n--------------------------------------------------------");
  console.log("📊 RESULTADO DOS TESTES DE INTERFACE: " + passaram + "/" + (passaram + falharam) + " passaram (" + (falharam === 0 ? "100% SUCESSO" : "COM FALHAS") + ")");
  console.log("--------------------------------------------------------\n");

  if (falharam > 0) process.exit(1);
}

testarInterface();
