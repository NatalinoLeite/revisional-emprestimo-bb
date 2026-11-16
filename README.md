# Módulo Revisional de Empréstimo Bancário (Foco: BB Crédito Salário)

Sistema especialista de triagem e cálculo pericial revisional de contratos bancários desenvolvido para escritórios de advocacia, compatível tanto com **Vercel (Full Stack Serverless)** quanto com **Google Apps Script (Planilhas Google e Drive)**.

---

## 🏛️ 1. Visão Geral e Arquitetura

O sistema automatiza o ciclo completo de análise revisional de operações de crédito pessoal (com ênfase na linha **BB Crédito Salário** do Banco do Brasil):
1. **Identificação e Vínculo**: Conexão com os clientes e processos judiciais.
2. **Extração Documental com IA**: Leitura automatizada de contratos e Cédulas de Crédito Bancário (CCBs) via Gemini API com JSON Schema estrito.
3. **Consulta Oficial ao Banco Central**: Obtenção das taxas médias de mercado (SGS Série 25464) e da taxa específica praticada pelo Banco do Brasil (Olinda OData).
4. **Motor Financeiro Determinístico**: Recálculo matematicamente auditável em múltiplos cenários (Price, SAC, Gauss, limitação STJ de 1,5x, 2,0x e expurgo de tarifas ilegais).
5. **Semáforo de Viabilidade**: Classificação inteligente em Verde, Amarelo ou Vermelho com estimativa do proveito econômico líquido do cliente.
6. **Laudo Pericial e Impressão**: Geração de relatório para petição inicial e impressão direta.

> [!IMPORTANT]
> **REGRA CENTRAL DE INTEGRIDADE CONTÁBIL**:
> A Inteligência Artificial (Gemini) é utilizada **ESTRITAMENTE** para leitura/extração dos dados do contrato e redação da narrativa fática. **TODO CÁLCULO FINANCEIRO É FEITO POR CÓDIGO DETERMINÍSTICO E AUDITÁVEL** em `motor.gs`. A IA nunca realiza cálculos nem altera valores numéricos.

---

## 🚀 2. Como Subir para o GitHub e Implantar na Vercel

O projeto já está com o repositório Git local inicializado e o primeiro commit realizado na branch `main`.

### Passo 1: Criar o Repositório no GitHub
1. Acesse sua conta no [GitHub](https://github.com/) e clique em **New repository**.
2. Dê um nome ao repositório (ex.: `revisional-emprestimo-bb`).
3. Deixe-o como **Public** ou **Private** e **NÃO** marque as caixas de inicialização (README, .gitignore ou license), pois o projeto local já possui esses arquivos.
4. Clique em **Create repository**.

### Passo 2: Enviar os Arquivos Locais para o GitHub
No terminal (PowerShell ou Bash) na pasta deste projeto, execute:

```powershell
# 1. Conecte o repositório remoto do seu GitHub (substitua pelo link do seu repo)
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git

# 2. Envie o código para o GitHub
git push -u origin main
```

### Passo 3: Deploy Instantâneo na Vercel
1. Acesse o painel da [Vercel](https://vercel.com/) e faça login com sua conta do GitHub.
2. Clique no botão **Add New... > Project**.
3. Localize o repositório `revisional-emprestimo-bb` na lista e clique em **Import**.
4. Na tela de configuração:
   - **Framework Preset**: Deixe em *Other* (a Vercel detecta automaticamente a pasta `public/` e as Serverless Functions em `api/`).
   - Expanda a seção **Environment Variables** e adicione as variáveis de ambiente:
     - **Name**: `GEMINI_API_KEY` | **Value**: `sua_chave_gemini`
     - **Name**: `GEMINI_MODEL` | **Value**: `gemini-3.8-flash`
     - **Name**: `OPENAI_API_KEY` | **Value**: `sua_chave_openai` (opcional / redundância)
     - **Name**: `LLM_PROVIDER` | **Value**: `GEMINI` (ou `OPENAI`)
5. Clique em **Deploy**.
6. Em cerca de 15 a 30 segundos, a Vercel disponibilizará uma URL pública segura com SSL (ex.: `https://revisional-emprestimo-bb.vercel.app`).

---

## 📂 3. Estrutura do Projeto

```text
├── api/                    # Serverless Functions da Vercel (Node.js runtime)
│   ├── calcular.js         # Endpoint POST /api/calcular (Motor determinístico)
│   ├── bcb.js              # Endpoint GET/POST /api/bcb (Consulta oficial BACEN)
│   └── extrair.js          # Endpoint POST /api/extrair (Extração documental Gemini)
├── public/                 # Frontend estático servido pela Vercel
│   └── index.html          # Interface responsiva moderna (Wizard em 4 passos)
├── motor.gs                # Funções matemáticas puras (Price, SAC, Newton-Raphson, Cenários)
├── bcb.gs                  # Clientes HTTP Olinda OData e SGS com cache e retries
├── ia.gs                   # Extração documental e sanitização
├── relatorio.gs            # Geração de laudo pericial
├── setup.gs                # Inicializador idempotente para Planilhas Google
├── Code.gs                 # Rotas do Google Apps Script (quando executado no GAS)
├── package.json            # Configuração de scripts e dependências
├── vercel.json             # Roteamento e rewrites da Vercel
├── .env.example            # Exemplo das variáveis de ambiente necessárias
├── .gitignore              # Arquivos ignorados pelo Git
└── testes*.js              # Suite completa com 27 testes automatizados
```

---

## 🧪 4. Como Rodar os Testes Automatizados Localmente

Para validar a integridade dos cálculos, das APIs do Banco Central e dos endpoints da Vercel:

```powershell
# Executa todos os testes unitários e de integração:
npm test
```

A bateria inclui:
- **`testes.gs`**: Validação de PMT da Tabela Price (R$ 10.000 em 24x a 3% = R$ 590,47), soma de amortizações = PV, saldo final zero, Newton-Raphson e semáforo.
- **`testes_bcb.js`**: Consultas reais ao SGS (Série 25464) e Olinda Diária (`BCO DO BRASIL S.A.`).
- **`testes_ia.js`**: Validação e sanitização da extração com Gemini.
- **`testes_interface.js`**: Integridade dos elementos do Wizard.
- **`testes_relatorio.js`**: Mascaramento LGPD (`123.***.***-00`) e datas.
- **`testes_vercel_api.js`**: Simulação das Serverless Functions `/api/calcular` e `/api/bcb`.

---

## 🔒 5. Segurança e LGPD

- **Variáveis de Ambiente**: A chave `GEMINI_API_KEY` fica armazenada de forma segura nas Environment Variables da Vercel, nunca exposta no código-fonte nem no navegador.
- **Privacidade**: O sistema mascara automaticamente dados de CPF/CNPJ nos laudos impressos.
- **Código Auditável**: Toda a matemática financeira é determinística e pode ser apresentada em juízo.
