# Módulo Revisional de Empréstimo Bancário (Foco: BB Crédito Salário)

Sistema especialista de triagem e cálculo pericial revisional de contratos bancários desenvolvido para escritório de advocacia em **Google Apps Script (Runtime V8)**, integrado com **Google Planilhas**, **Google Drive**, **Google Docs**, **APIs oficiais do Banco Central do Brasil (BACEN)** e **Google Gemini API**.

---

## 🏛️ 1. Visão Geral e Arquitetura

O sistema automatiza o ciclo completo de análise revisional de operações de crédito pessoal (com ênfase na linha **BB Crédito Salário** do Banco do Brasil):
1. **Identificação e Vínculo**: Conexão com os clientes e processos judiciais existentes na planilha.
2. **Extração Documental com IA**: Leitura automatizada de contratos e Cédulas de Crédito Bancário (CCBs) via Gemini API com JSON Schema estrito.
3. **Consulta Oficial ao Banco Central**: Obtenção das taxas médias de mercado (SGS Série 25464) e da taxa específica praticada pelo Banco do Brasil (Olinda OData).
4. **Motor Financeiro Determinístico**: Recálculo matematicamente auditável em múltiplos cenários (Price, SAC, Gauss, limitação STJ de 1,5x, 2,0x e expurgo de tarifas ilegais).
5. **Semáforo de Viabilidade**: Classificação inteligente em Verde, Amarelo ou Vermelho com estimativa do proveito econômico líquido do cliente.
6. **Relatório Pericial em PDF**: Geração automática de documento timbrado e registro do histórico na planilha.

> [!IMPORTANT]
> **REGRA CENTRAL DE INTEGRIDADE CONTÁBIL**:
> A Inteligência Artificial (Gemini) é utilizada **ESTRITAMENTE** para leitura/extração dos dados do contrato e redação da narrativa fática. **TODO CÁLCULO FINANCEIRO É FEITO POR CÓDIGO DETERMINÍSTICO E AUDITÁVEL** em `motor.gs`. A IA nunca realiza cálculos nem altera valores numéricos.

---

## 📂 2. Estrutura de Arquivos

```text
├── Code.gs             # Rotas WebApp (doGet), controle de permissões e endpoints de API
├── setup.gs            # Função idempotente setupRevisional() para criação e setup das abas
├── motor.gs            # Funções matemáticas puras (Price, SAC, Newton-Raphson, cenários A-E)
├── bcb.gs              # Clientes HTTP para API Olinda OData e SGS com cache e retries
├── ia.gs               # Gestão de uploads no Drive, integração Gemini e síntese jurídica
├── relatorio.gs        # Geração do laudo preliminar em Google Docs/PDF e mascaramento LGPD
├── appsscript.json     # Manifesto do Google Apps Script com escopos e fuso horário SP
├── index.html          # Shell principal da interface com inclusão de componentes
├── wizard.html         # Wizard responsivo em 4 passos
├── css.html            # Folha de estilos moderna, limpa e responsiva (sem frameworks pesados)
├── js.html             # Lógica client-side, máscaras monetárias (R$) e chamadas assíncronas
├── testes.gs           # Suite de testes unitários do motor financeiro
├── testes_bcb.js       # Suite de testes de integração com o Banco Central
├── testes_ia.js        # Suite de testes de validação e sanitização da IA
├── testes_interface.js # Testes de integridade dos componentes do Wizard
├── testes_relatorio.js # Testes de formatação, LGPD e geração de PDF
└── README.md           # Documentação técnica e operacional
```

---

## ⚙️ 3. Configuração e Instalação Inicial

### Passo 1: Vinculação e Execução do Setup
1. Abra a Planilha Google que serve de banco de dados do escritório.
2. Acesse **Extensões > Apps Script**.
3. Adicione os arquivos do projeto (`.gs` e `.html`) ou sincronize via `clasp push`.
4. No editor de código, selecione o arquivo `setup.gs`, escolha a função **`setupRevisional`** e clique em **Executar**.
5. Conceda as permissões de acesso solicitadas pelo Google.
6. A função criará automaticamente e de forma idempotente as abas:
   - **`Revisionais`**: Cadastro das operações calculadas e resultados em JSON.
   - **`TaxasBCB`**: Cache persistente de taxas com expiração (TTL).
   - **`ConfigRevisional`**: Tabela com 18 parâmetros de parametrização editáveis.
   - **`Clientes`, `Processos`, `Usuarios`**: Garantidas para compatibilidade com o sistema do escritório.

### Passo 2: Configuração da Chave da Gemini API (Script Properties)
Nunca insira chaves de API no código-fonte.
1. Obtenha uma chave gratuita da API Gemini no [Google AI Studio](https://aistudio.google.com/).
2. No editor do Apps Script, clique no ícone de **Configurações do Projeto** (engrenagem no menu lateral esquerdo).
3. Role até a seção **Propriedades do script** e clique em **Editar propriedades do script**.
4. Adicione a seguinte propriedade:
   - **Propriedade**: `GEMINI_API_KEY`
   - **Valor**: `sua_chave_de_api_aqui`
5. *(Opcional)* Adicione também:
   - **Propriedade**: `GEMINI_MODEL` | **Valor**: `gemini-2.5-flash` (padrão)
   - **Propriedade**: `LLM_PROVIDER` | **Valor**: `GEMINI` (ou `OPENAI` caso deseje alternar)
6. Clique em **Salvar propriedades do script**.

---

## 📊 4. Parâmetros Editáveis (`ConfigRevisional`)

A aba **`ConfigRevisional`** permite que a equipe jurídica ajuste a sensibilidade dos cálculos e semáforos sem alterar uma única linha de código:

| Chave | Valor Padrão | Descrição |
| :--- | :--- | :--- |
| `limite_verde_multiplicador` | `2.0` | Multiplicador de abusividade manifesta para semáforo VERDE ($\ge 2,0\times$ a média). |
| `limite_amarelo_multiplicador` | `1.5` | Padrão jurisprudencial STJ para semáforo AMARELO ($1,5\times$ a $2,0\times$). |
| `limiar_relevancia_reais` | `3000.00` | Proveito econômico mínimo em R$ para considerar viabilidade expressiva. |
| `multiplicador_cenario_b` | `1.0` | Cenário B: substituição integral pela taxa média de mercado. |
| `multiplicador_cenario_c` | `1.5` | Cenário C: limitação ao teto de tolerância do STJ. |
| `multiplicador_cenario_d` | `2.0` | Cenário D: patamar de abusividade qualificada. |
| `indice_correcao_padrao` | `IPCA` | Índice oficial de atualização monetária para parcelas pagas. |
| `codigo_sgs_indice_padrao` | `433` | Código da série SGS do BACEN (IPCA=433, INPC=188, IGP-M=196, Selic=4390). |
| `juros_mora_mensal` | `1.0` | Juros de mora legais (% ao mês). |
| `honorarios_contratuais_perc` | `20.0` | Percentual padrão de honorários para cálculo do valor líquido do cliente. |
| `comprometimento_renda_alerta` | `30.0` | Percentual da renda líquida para acionar alerta de superendividamento (Lei 14.181/2021). |
| `cache_bcb_ttl_dias` | `30` | Validade do cache local das taxas em dias. |
| `modalidade_olinda_padrao` | `Crédito pessoal não consignado - Prefixado` | Modalidade padrão no OData Olinda (Código `221101`). |
| `serie_sgs_media_mensal` | `25464` | Código da série SGS para a taxa média mensal de mercado (% a.m.). |
| `instituicao_padrao` | `BCO DO BRASIL S.A.` | Nome cadastrado no BACEN para BB Crédito Salário. |

---

## 🧮 5. Metodologia Contábil e Cenários (`motor.gs`)

O motor financeiro implementa:
1. **Taxa Implícita (Newton-Raphson com Bisseção)**:
   - Resolve $f(i) = PMT \cdot \frac{1 - (1+i)^{-n}}{i} - PV = 0$.
   - Sinaliza divergências quando a taxa praticada for superior à declarada em contrato em mais de $0,05\%$ a.m.
2. **Cronograma Tabela Price com Liquidação Estrita**:
   - Resíduo de centavos ajustado na última prestação para saldo final estritamente zero ($\sum A_k = PV$).
3. **Cenários Analisados**:
   - **Cenário A (Contrato Original)**: Cronograma pactuado com taxa original.
   - **Cenário B (Taxa Média BACEN 1,0x)**: Substituição direta pela taxa de mercado divulgada pelo BACEN.
   - **Cenário C (Critério STJ 1,5x)**: Limitação a 1,5 vezes a taxa de mercado (tese principal da ação).
   - **Cenário D (Abusividade 2,0x)**: Limitação em 2 vezes a taxa média.
   - **Cenário E (Expurgo de Tarifas e Seguro)**: Deduz TAC/cadastro e seguro prestamista embutido em venda casada (Tema 958 e 972/STJ) do principal financiado, recalculando as parcelas.
   - **Cenário Combinado**: Taxa média cumulada com expurgo total de tarifas.

---

## 🧪 6. Como Rodar a Suite de Testes Automatizados

### Opção A: No Editor do Google Apps Script
1. Abra o arquivo `testes.gs`.
2. Selecione a função **`executarTestesUnitarios`** no menu superior.
3. Clique em **Executar** e abra o painel **Registro de Execução (Logs)** para conferir o resultado detalhado.

### Opção B: No Terminal Local (Node.js)
O projeto foi estruturado com compatibilidade universal. Para rodar todos os testes localmente via terminal:

```powershell
# 1. Testes do Motor Financeiro (Tabela Price, Newton-Raphson, Cenários e Semáforo)
node testes.gs

# 2. Testes de Integração Real com o Banco Central (SGS e Olinda)
node testes_bcb.js

# 3. Testes do Módulo de IA e Sanitização
node testes_ia.js

# 4. Testes de Integridade da Interface e Rotas
node testes_interface.js

# 5. Testes do Módulo de Relatório em PDF e LGPD
node testes_relatorio.js
```

---

## 🚀 7. Como Implantar como Web App

1. No editor do Google Apps Script, clique no botão azul **Implantar > Nova implantação**.
2. Clique no ícone de engrenagem ao lado de "Tipo" e selecione **App da Web**.
3. Configure os parâmetros:
   - **Descrição**: `Módulo Revisional BB v1.0`
   - **Executar como**: `Usuário que está acessando o aplicativo da Web` (ou `Eu`, conforme política do escritório).
   - **Quem tem acesso**: `Qualquer pessoa com uma Conta do Google` (o acesso interno é restrito pela aba `Usuarios`).
4. Clique em **Implantar** e copie a **URL do aplicativo da Web**.
5. Distribua a URL para os advogados do escritório.

---

## 🔒 8. Privacidade, LGPD e Segurança

- **Proteção de Dados Sensíveis**: CPF e CNPJ são automaticamente mascarados nos relatórios impressos (`123.***.***-00`).
- **Logs Limpos**: Nenhuma informação confidencial do mutuário é gravada em logs do sistema (`Logger.log`).
- **Segurança de Credenciais**: A chave `GEMINI_API_KEY` fica armazenada de forma segura nas Script Properties do projeto, nunca exposta ao frontend nem no repositório.
- **Controle de Acesso**: Validação de e-mail ativo na aba `Usuarios` impede acessos de contas não autorizadas.
