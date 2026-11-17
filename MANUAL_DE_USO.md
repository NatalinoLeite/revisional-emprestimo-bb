# 📖 Manual de Uso Operacional e Pericial
## Sistema de Cálculo e Auditoria Revisional de Empréstimos Bancários

---

### 📑 Sumário
1. [Visão Geral e Metodologia](#1-visão-geral-e-metodologia)
2. [Formas de Acesso e Execução](#2-formas-de-acesso-e-execução)
3. [Configuração de Chaves de IA (BYOK)](#3-configuração-de-chaves-de-ia-byok)
4. [Passo a Passo Operacional (O Wizard em 4 Etapas)](#4-passo-a-passo-operacional-o-wizard-em-4-etapas)
   - [Etapa 1: Identificação do Cliente e Processo](#etapa-1-identificação-do-cliente-e-processo)
   - [Etapa 2: Extração e Conferência dos Dados do Contrato](#etapa-2-extração-e-conferência-dos-dados-do-contrato)
   - [Etapa 3: Consulta e Auditoria das Taxas no BACEN](#etapa-3-consulta-e-auditoria-das-taxas-no-bacen)
   - [Etapa 4: Resultado Pericial, Cenários e Laudo em PDF](#etapa-4-resultado-pericial-cenários-e-laudo-em-pdf)
5. [Compreendendo a Matriz Pericial de Probabilidade de Procedência](#5-compreendendo-a-matriz-pericial-de-probabilidade-de-procedência)
6. [Particularidades por Modalidade de Crédito](#6-particularidades-por-modalidade-de-crédito)
   - [Empréstimo Trabalhador CLT (Consignado ou Débito em Conta)](#a-empréstimo-trabalhador-clt)
   - [Aposentados e Pensionistas do INSS](#b-aposentados-e-pensionistas-do-inss)
   - [Servidores Públicos](#c-servidores-públicos)
   - [Financiamento de Veículos (CDC)](#d-financiamento-de-veículos-cdc)
7. [Geração do Laudo Pericial em PDF](#7-geração-do-laudo-pericial-em-pdf)
8. [Perguntas Frequentes & Solução de Problemas (Troubleshooting)](#8-perguntas-frequentes--solução-de-problemas)

---

### 1. Visão Geral e Metodologia

O **Sistema de Cálculo Revisional** é uma solução pericial contábil e jurídica desenhada para auditar contratos bancários de empréstimos e financiamentos, identificar cobranças abusivas e fundamentar com precisão matemática ações revisionais ou acordos extrajudiciais.

#### Pilares Metodológicos:
- **Cálculo Determinístico:** O motor financeiro (`motor.gs`) utiliza o algoritmo numérico de **Newton-Raphson** para encontrar a taxa efetiva real (taxa implícita) cobrada pelo banco, além dos sistemas de amortização **Tabela Price**, **SAC** e **Método Gauss**.
- **Conexão Oficial com o BACEN:** Conecta-se diretamente às APIs do Banco Central do Brasil (**SGS Séries Temporais** e **Olinda OData v2**) para resgatar a taxa média de mercado e o ranking da instituição financeira na data exata da contratação.
- **Rigor Pericial Estrito (Sem Alucinações):** O sistema não formula pedidos genéricos ou infundados. A triagem analisa cada cláusula real do contrato (seguro prestamista, tarifas acessórias, parcelas pagas e comprometimento salarial) e classifica o êxito de acordo com os **recursos repetitivos e súmulas vinculantes do Superior Tribunal de Justiça (STJ)**.

---

### 2. Formas de Acesso e Execução

O sistema pode ser utilizado de duas maneiras:

#### Opção A: Execução em Nuvem (Vercel)
- Acesse diretamente o endereço da sua aplicação hospedada na Vercel pelo navegador (desktop, tablet ou smartphone).
- Não requer nenhuma instalação no computador local.
- Atualizações feitas no repositório GitHub (`main`) são publicadas automaticamente na Vercel em poucos segundos.

#### Opção B: Execução Local no Computador (Windows)
1. Abra a pasta do projeto no Windows Explorer:
   `c:\Users\natal\OneDrive\Documentos\SISTEMA DE CALCULO EMPRESTIMO`
2. Dê um duplo clique no arquivo **`iniciar_local.bat`** (ou execute `npm start` no terminal).
3. Abra seu navegador de internet e acesse:
   **`http://localhost:3000`**

> [!WARNING]
> Não abra o arquivo `public/index.html` diretamente com dois cliques (protocolo `file://`), pois os navegadores bloqueiam requisições de rede à IA e ao Banco Central por restrições de segurança de CORS. Use sempre `http://localhost:3000` ou a URL da Vercel.

---

### 3. Configuração de Chaves de IA (BYOK)

A aplicação conta com o sistema **BYOK (Bring Your Own Key)**. As suas chaves de API nunca ficam expostas no código do GitHub: elas são salvas de forma privativa e criptografada no `localStorage` do seu próprio navegador.

1. No canto superior direito da página, clique no botão **"⚙️ Chaves de IA"**.
2. No modal que se abrir:
   - **Chave Google Gemini API (Recomendada):** Obtenha gratuitamente em [Google AI Studio](https://aistudio.google.com/app/apikey). Cole a chave (inicia com `AIzaSy...` ou `AQ...`).
   - **Modelo Gemini:** Selecione **`gemini-3.1-flash-lite`** (ultra-rápido, excelente para leitura de contratos bancários).
   - **Chave OpenAI API (Opcional):** Caso deseje manter contingência para fotos com ChatGPT.
3. Clique em **"Salvar Chaves"**.
4. A bolinha do botão ficará **verde (●)**, indicando que a IA está ativa e pronta para leitura automática de PDFs.

---

### 4. Passo a Passo Operacional (O Wizard em 4 Etapas)

A interface é estruturada em um assistente guiado de 4 etapas:

```
[1. Cliente & Processo] ➔ [2. Contrato & IA] ➔ [3. Taxas BACEN] ➔ [4. Resultado & Laudo]
```

---

#### Etapa 1: Identificação do Cliente e Processo
Nesta tela você informa a qualificação básica do mutuário:
- **Nome do Cliente:** Nome completo do titular do empréstimo.
- **CPF:** Documento do cliente (no laudo final, o CPF é automaticamente mascarado para proteção de dados sensíveis conforme a LGPD, ex.: `123.***.***-00`).
- **Número do Processo Judicial:** Se a ação já estiver distribuída, informe a numeração CNJ (ex.: `1012345-67.2024.8.26.0100`). Se for análise inicial, digite *"Fase Pré-Processual"*.
- **Renda Líquida Mensal (R$):** **Campo crucial.** Informe o salário líquido que cai na conta ou no holerite. A ferramenta confrontará esse valor com a parcela para apurar se há **Superendividamento (Lei 14.181/2021)** e emitir subsídios para liminar de retenção.

Clique em **"Continuar para o Contrato →"**.

---

#### Etapa 2: Extração e Conferência dos Dados do Contrato

Você pode inserir os dados de duas formas:

1. **Leitura Automática com Inteligência Artificial:**
   - Arraste ou clique na área pontilhada para selecionar a **Cédula de Crédito Bancário (CCB)** ou extrato de empréstimo em PDF ou imagem.
   - O Gemini lerá o documento e preencherá automaticamente todos os campos:
     - Instituição Financeira (ex.: *BCO DO BRASIL S.A.*, *BANCO SANTANDER (BRASIL) S.A.*, etc.)
     - Modalidade do Crédito
     - Data da Contratação
     - Valor Liberado Líquido (R$)
     - Prazo total em meses
     - Valor da Parcela mensal (R$)
     - Taxa Mensal Declarada no contrato (% a.m.)
     - Tarifas de Abertura / Cadastro (TAC)
     - Seguro Prestamista financiado

2. **Preenchimento Manual / Conferência:**
   - Confira os dados extraídos pela IA e complete:
     - **Parcelas Já Pagas:** Quantas parcelas o cliente já quitou até a data atual (necessário para calcular a repetição de indébito e o valor a ser devolvido em dinheiro).

Clique em **"Avançar para Consulta BACEN →"**.

---

#### Etapa 3: Consulta e Auditoria das Taxas no BACEN

Nesta tela, o sistema executa a auditoria financeira:
1. **Consulta em Tempo Real:** Conecta-se às APIs oficiais do Banco Central e localiza a taxa média de mercado divulgada para o mês/ano do contrato.
2. **Cálculo da Taxa Implícita Real:** Utiliza a fórmula matemática de equivalência de juros para descobrir se o banco embutiu juros disfarçados cobrando uma taxa efetiva maior do que a declarada na CCB.
3. **Indicador de Disparidade:** Apresenta a razão multiplicadora:
   $$\text{Razão} = \frac{\text{Taxa Efetiva do Contrato}}{\text{Taxa Média de Mercado (BACEN)}}$$
   - Exemplo: Contrato cobrou $4,07\%$ a.m. e a média do BACEN era $1,82\%$ a.m. $\rightarrow$ Razão de **$2,23\times$ a média oficial**!
4. **Fallback Manual:** Se as APIs governamentais do Banco Central estiverem instáveis ou fora do ar, você pode digitar manualmente a taxa no campo de contingência.

Clique em **"Calcular Cenários & Viabilidade →"**.

---

#### Etapa 4: Resultado Pericial, Cenários e Laudo em PDF

Esta é a tela final onde o laudo contábil é gerado:
- **Identificação do Laudo:** Cabeçalho formal pericial com o nome do cliente, CPF protegido, processo, banco e data de emissão.
- **Semáforo de Viabilidade Revisional:**
  - 🟢 **VERDE (Alta Viabilidade):** Taxa $\ge 1,5\times$ a média ou proveito financeiro elevado.
  - 🟡 **AMARELO (Viabilidade Moderada):** Taxa entre $1,3\times$ e $1,5\times$, ou cobrança expressiva de tarifas/seguro.
  - 🔴 **VERMELHO (Baixa Viabilidade):** Taxa alinhada à média de mercado (Súmula 382/STJ).
- **Cards de Métricas Executivas:**
  - Parcela Atual vs. Nova Parcela Recalculada;
  - Redução Mensal obtida;
  - Restituição estimada de parcelas pagas;
  - Redução do Saldo Devedor total da dívida;
  - Proveito Econômico Total e Valor Líquido estimado do cliente.
- **Gráficos Visuais de Economia:** Barras proporcionais do contrato original vs. revisado.
- **Tabela Comparativa de 6 Cenários:**
  - *Cenário A:* Contrato Original;
  - *Cenário B:* Substituição pela Taxa Média do BACEN ($1,0\times$);
  - *Cenário C:* Aplicação do Critério Jurisprudencial do STJ ($1,5\times$ - Tema 247);
  - *Cenário D:* Abusividade Qualificada ($2,0\times$);
  - *Cenário E:* Expurgo de Tarifas e Seguro Prestamista;
  - *Cenário COMBINADO:* Taxa Média do BACEN cumulada com o expurgo de tarifas e seguros.
- **Triagem Pericial Contábil & Matriz de Probabilidade de Procedência:** (ver seção detalhada abaixo).

---

### 5. Compreendendo a Matriz Pericial de Probabilidade de Procedência

A Matriz Pericial de Procedência avalia friamente a viabilidade de cada pedido para evitar que o advogado formule pedidos sem fato gerador que gerem ônus de sucumbência:

| Pedido Revisional | Fato Contratual Auditado | Precedente Vinculante | Classificação de Probabilidade |
|---|---|---|:---:|
| **1. Limitação de Juros** | Taxa real vs. Média do BACEN | **Tema 247/STJ** e **Súmula 382/STJ** | **ALTA / MUITO ALTA** se $\ge 1,5\times$<br>**MÉDIA** se $1,3\times$ a $1,5\times$<br>**BAIXA** se $< 1,3\times$ |
| **2. Expurgo de Seguro Prestamista** | Valor embutido de prêmio | **Tema Repetitivo 972/STJ** | **ALTA** (se cobrado seguro)<br>**INAPLICÁVEL** (se seguro $= \text{R\$} 0,00$) |
| **3. Ilegalidade de Tarifas (TAC/Cadastro)** | Valor cobrado de tarifas operacionais | **Súmula 566/STJ** e **Tema 618/STJ** | **MÉDIA A ALTA** (se renovação)<br>**INAPLICÁVEL** (se $= \text{R\$} 0,00$) |
| **4. Superendividamento (Mínimo Existencial)** | Parcela vs. Renda líquida declarada | **Lei 14.181/2021** e **Tema 1085/STJ** | **ALTA** (se parcela $> 35\%$ da renda)<br>**MÉDIA** ($30\%$ a $35\%$)<br>**BAIXA** ($< 30\%$) |
| **5. Repetição de Indébito** | Quantidade de parcelas pagas | **Art. 42 CDC** e **EAREsp 676.608/RJ** | **ALTA** (forma simples)<br>**MÉDIA** (em dobro)<br>**INAPLICÁVEL** ($0$ parcelas pagas) |
| **6. Capitalização / Anatocismo** | Taxa anual vs. Duodécuplo mensal | **Súmula 541/STJ** | **BAIXA** *(Alerta de risco pelo STJ)* |

---

### 6. Particularidades por Modalidade de Crédito

#### A. Empréstimo Trabalhador CLT
- **Consignado em Folha:** Selecione a modalidade `Crédito pessoal consignado privado - Prefixado`. A taxa média do BACEN é menor do que a do crédito comum; se o banco cobrou juros elevados, a disparidade é substancial.
- **Débito em Conta Salário (ex.: BB Crédito Salário):** Selecione `Crédito pessoal não consignado - Prefixado`. Se o desconto comprometer mais de 35% do salário líquido, utilize o cálculo do Passo 1 para requerer liminar de tutela de urgência com amparo na Lei 14.181/2021.
- **Seguro Desemprego Embutido:** Prática rotineira em contratos CLT. A cobrança de seguro sem opção de escolha externa gera procedência certa no Tema 972/STJ.

#### B. Aposentados e Pensionistas do INSS
- Selecione `Crédito pessoal consignado inss - Prefixado`.
- Verifique o teto oficial do INSS vigente na data da contratação. Qualquer taxa acima do teto normativo do CNPS/INSS configura ilegalidade absoluta.

#### C. Servidores Públicos
- Selecione `Crédito pessoal consignado público - Prefixado`.
- Apura a margem consignável e a abusividade de taxas em relação à média governamental divulgada pelo BACEN.

#### D. Financiamento de Veículos (CDC)
- Selecione `Financiamento de veículos - Prefixado`.
- Analise cobranças de seguro prestamista, tarifa de avaliação do bem e taxa de registro de contrato.

---

### 7. Geração do Laudo Pericial em PDF

1. Na **Etapa 4**, após conferir todos os cálculos e a Matriz Pericial, clique no botão azul:
   **`🖨️ Imprimir / Salvar Laudo em PDF`**
2. A tela de impressão do navegador será aberta.
3. Configure:
   - **Destino:** *"Salvar como PDF"*
   - **Páginas:** *Todas*
   - **Layout:** *Retrato*
   - **Gráficos de segundo plano:** *Marcar / Ativar* (para que as cores do semáforo e das tabelas sejam impressas com fidelidade).
4. Clique em **Salvar**.
5. O documento gerado é um **Laudo Pericial Contábil Completo**, estruturado com linguagem técnica forense, pronto para ser anexado à Petição Inicial, Notificação Extrajudicial ou Réplica à Contestação.

---

### 8. Perguntas Frequentes & Solução de Problemas

#### P: O que fazer se a IA não conseguir ler o documento?
- **R:** Verifique se o arquivo está legível (não muito borrado ou cortado). Se o arquivo for muito antigo ou manuscrito, você pode preencher os campos diretamente na tela do Passo 2 sem qualquer prejuízo ao cálculo.

#### P: O que é a Taxa Implícita e por que ela difere da taxa do contrato?
- **R:** A taxa do contrato (declarada) é o que o banco escreveu na primeira página. A taxa implícita é a taxa que o banco efetivamente cobrou pela matemática financeira, considerando o valor liberado líquido na conta e a soma das parcelas. Quase sempre a taxa real implícita é superior à taxa declarada!

#### P: A calculadora funciona no celular?
- **R:** Sim, o design é 100% responsivo e funciona em qualquer smartphone ou tablet através do link da Vercel.

#### P: Como atualizar a aplicação na Vercel após alterar códigos?
- **R:** Basta executar o arquivo `subir_github.bat` ou executar no terminal:
  ```bash
  git add .
  git commit -m "feat: melhorias no sistema"
  git push origin main
  ```
  A Vercel recompila e atualiza o site no ar em menos de 1 minuto.

---
*Manual técnico elaborado para operadores do Direito, contadores, peritos e assessores jurídicos.*
