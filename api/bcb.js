/**
 * @file api/bcb.js
 * @description Serverless Function Vercel: Consulta taxas oficiais no Banco Central (SGS e Olinda).
 */

const bcb = require("../bcb.gs");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const params = req.method === "POST" ? req.body : req.query;

    if (!params.dataContrato) {
      return res.status(400).json({ sucesso: false, erro: "O parâmetro dataContrato é obrigatório (YYYY-MM-DD)." });
    }

    const resultado = bcb.consultarTaxasBancoCentral({
      dataContrato: params.dataContrato,
      modalidade: params.modalidade || "Crédito pessoal não consignado - Prefixado",
      instituicao: params.instituicao || "BCO DO BRASIL S.A.",
      fallbackTaxaManual: params.fallbackTaxaManual ? parseFloat(params.fallbackTaxaManual) : undefined,
      usarManualApenas: params.usarManualApenas === true || params.usarManualApenas === "true"
    });

    return res.status(200).json({
      sucesso: true,
      dados: resultado
    });
  } catch (erro) {
    return res.status(500).json({
      sucesso: false,
      erro: erro.message
    });
  }
};
