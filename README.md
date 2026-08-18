# Assistente Virtual WhatsApp - Distribuidora (MVP SaaS)

Uma prova de conceito (PoC) de um assistente virtual autônomo para o WhatsApp, focado em automatizar o atendimento e escalar as vendas de distribuidoras regionais de gás.

## Visão Geral
Este projeto implementa uma arquitetura orientada a eventos para processar mensagens recebidas no WhatsApp e conduzir o cliente por um funil de vendas completo (escolha do produto, quantidade, endereço e forma de pagamento) sem intervenção humana. 

## Tecnologias Utilizadas
* **Ambiente:** Node.js
* **Integração WhatsApp:** Biblioteca Baileys (@whiskeysockets/baileys) via WebSockets.
* **Banco de Dados:** PostgreSQL (para persistência de estado e dados do cliente).

## Principais Funcionalidades e Arquitetura
* **Máquina de Estados Finitos:** O fluxo conversacional é gerenciado por estados (`INICIO`, `ESCOLHENDO_PRODUTO`, `PAGAMENTO_TIPO`, etc.), garantindo que o bot entenda o contexto exato do cliente.
* **Lembretes Preditivos:** Lógica de negócio implementada para calcular o tempo médio de consumo do cliente e automatizar o envio de lembretes para novas compras.
* **Persistência em Tempo Real:** Integração com PostgreSQL para salvar o progresso do pedido e o endereço do cliente a cada etapa.
* **Experiência do Usuário (UX):** Simulação de digitação assíncrona (`composing`) para tornar a interação mais orgânica.

## Como Executar e Testar Localmente

1. **Configuração do Ambiente:**
   - Clone o repositório e rode `npm install`.
   - Crie um arquivo `.env` na raiz e configure sua string de conexão na variável `DATABASE_URL`.

2. **Banco de Dados:**
   - Execute o script `node criar-tabela.js` para inicializar a estrutura no PostgreSQL.

3. **Inicialização e Autenticação (WhatsApp):**
   - Inicie o servidor com: `npm start` ou `node index.js`.
   - Um QR Code será exibido no terminal.
   - Abra o WhatsApp no celular que servirá como bot, vá em "Aparelhos Conectados" e escaneie o código.

4. **Testando o Fluxo:**
   - De outro número, envie a palavra exata "Menu" para o número do bot para acionar a automação.

## Resolução de Problemas
* **Falha no QR Code:** Caso o QR Code expire ou a conexão falhe, apague manualmente a pasta `auth_info_baileys` e reinicie a aplicação para gerar um novo código.