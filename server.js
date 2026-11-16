/**
 * @file server.js
 * @description Servidor HTTP local nativo (sem dependências externas) para executar
 * o Sistema Revisional de Empréstimos localmente na porta 3000.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

// 1. Carregar variáveis do .env (se existir)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.trim();
    }
  });
  console.log("⚙️  Variáveis de ambiente carregadas do .env");
}

// Handlers das APIs
const handlerCalcular = require("./api/calcular.js");
const handlerBCB = require("./api/bcb.js");
const handlerExtrair = require("./api/extrair.js");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf"
};

// Helper para adaptar req/res padrão do Node para a interface serverless da Vercel
function adaptarServerless(req, res, parsedUrl, bodyJson) {
  req.query = parsedUrl.query;
  req.body = bodyJson;

  res.status = function(code) {
    this.statusCode = code;
    return this;
  };

  res.json = function(data) {
    this.setHeader("Content-Type", "application/json; charset=utf-8");
    this.end(JSON.stringify(data));
    return this;
  };
}

const server = http.createServer(async (req, res) => {
  // CORS universal para desenvolvimento local
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. ROTAS DE API
  if (pathname.startsWith("/api/")) {
    let bodyData = "";
    req.on("data", chunk => { bodyData += chunk; });
    req.on("end", async () => {
      let bodyJson = {};
      if (bodyData) {
        try {
          bodyJson = JSON.parse(bodyData);
        } catch (e) {
          bodyJson = {};
        }
      }

      adaptarServerless(req, res, parsedUrl, bodyJson);

      try {
        if (pathname === "/api/calcular") {
          await handlerCalcular(req, res);
        } else if (pathname === "/api/bcb") {
          await handlerBCB(req, res);
        } else if (pathname === "/api/extrair") {
          await handlerExtrair(req, res);
        } else {
          res.status(404).json({ sucesso: false, erro: "Rota de API não encontrada." });
        }
      } catch (err) {
        console.error("Erro na API " + pathname + ":", err);
        res.status(500).json({ sucesso: false, erro: err.message });
      }
    });
    return;
  }

  // 2. ARQUIVOS ESTÁTICOS (public/)
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

  // Se for uma requisição sem extensão e não existir, tenta com .html
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".html")) {
    filePath = filePath + ".html";
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // Redireciona para index.html (SPA fallback)
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 - Página não encontrada");
    }
  }
});

server.listen(PORT, () => {
  console.log("\n========================================================");
  console.log(`🚀 SISTEMA REVISIONAL DE EMPRÉSTIMOS RODANDO LOCALMENTE!`);
  console.log(`👉 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`📡 Provedor de IA ativo: ${process.env.LLM_PROVIDER || "GEMINI"} (${process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"})`);
  console.log("========================================================\n");
});
