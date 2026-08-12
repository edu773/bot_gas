\# Bot de Automação para Distribuidoras de Gás (SaaS)



\## Sobre o Projeto

Este projeto consiste em uma API de automação baseada no WhatsApp, desenvolvida com o objetivo de otimizar e escalar o atendimento de distribuidoras regionais de gás. A aplicação funciona como um assistente virtual autônomo e foi arquitetada com foco em um modelo de negócio SaaS (Software as a Service).



\## Funcionalidades Principais

\* \*\*Processamento Automatizado:\*\* Recebimento e gerenciamento de pedidos de clientes via WhatsApp sem intervenção humana.

\* \*\*Assistente Virtual:\*\* Fluxo de conversação estruturado para coleta de dados de entrega e confirmação de compra.

\* \*\*Lembretes Preditivos:\*\* Lógica de negócio implementada para calcular o tempo médio de consumo do cliente e enviar lembretes automáticos para novas compras.



\## Tecnologias Utilizadas

\* \*\*Backend:\*\* Node.js

\* \*\*Banco de Dados:\*\* PostgreSQL / SQL 

\* \*\*Integração:\*\* API do WhatsApp

\* \*\*Arquitetura:\*\* RESTful API



\## Como Executar Localmente



\### Pré-requisitos

\* Node.js instalado

\* Instância do PostgreSQL rodando



\### Instalação

1\. Clone o repositório:

&#x20;  ```bash

&#x20;  git clone \[https://github.com/edu773/bot\_gas



Instale as dependências:



npm install

Configure as variáveis de ambiente:

Crie um arquivo .env na raiz do projeto e configure as credenciais do banco de dados e as chaves da API do WhatsApp.



Inicie o servidor:



npm start

