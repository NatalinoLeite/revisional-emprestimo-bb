/**
 * @file api/calcular.js
 * @description Serverless Function Vercel: Executa o motor determinístico de cálculo revisional.
 */

const motor = require("../motor.gs");

module.exports = async function handler(req, res) {
  // Configuração CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ sucesso: false, erro: "Método não permitido. Utilize POST." });
  }

  try {
    const params = req.body || {};
    
    // Configurações padrão de cálculo
    params.config = Object.assign({
      limite_verde_multiplicador: 2.0,
      limite_amarelo_multiplicador: 1.5,
      limiar_relevancia_reais: 3000.0,
      multiplicador_cenario_b: 1.0,
      multiplicador_cenario_c: 1.5,
      multiplicador_cenario_d: 2.0,
      juros_mora_mensal: 1.0,
      honorarios_contratuais_perc: 20.0,
      comprometimento_renda_alerta: 30.0
    }, params.config || {});

    const resultado = motor.calcularRevisionalCompleta(params);

    return res.status(200).json({
      sucesso: true,
      resultado: resultado
    });
  } catch (erro) {
    return res.status(400).json({
      sucesso: false,
      erro: erro.message
    });
  }
};
