# Assistente Virtual WhatsApp — Distribuidora

MVP de atendimento automatizado via WhatsApp, utilizando **Node.js**, **Baileys** e **PostgreSQL**. O fluxo conversacional é controlado por uma máquina de estados e os dados são persistidos no banco.

## Stack

* Node.js 18+
* Baileys (`@whiskeysockets/baileys`)
* PostgreSQL
* `pg`
* `dotenv`

## Configuração

### 1. Dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Crie `.env` na raiz:

```env
DATABASE_URL=postgresql://usuario:senha@localhost:5432/zapgas
```

### 3. Banco de dados

Crie o banco especificado em `DATABASE_URL` e execute:

```bash
node criar-tabela.js
```

### 4. Execução

```bash
node index.js
```

Na primeira execução, um QR Code será exibido no terminal. Escaneie-o em **WhatsApp → Dispositivos conectados → Conectar dispositivo**.

A sessão autenticada será armazenada localmente para as próximas execuções.

## Uso

Após a autenticação, envie `Menu` para o número conectado ao bot.

O fluxo atual contempla:

```text
Menu
 ├─ Gás
 └─ Água
      ↓
   Endereço
      ↓
   Pagamento
      ↓
  Confirmação
```

## Estrutura

```text
.
├── index.js          # Inicialização e lógica do bot
├── criar-tabela.js   # Inicialização do schema
├── .env.example      # Modelo de configuração
├── package.json
└── README.md
```

## Observação

O projeto utiliza Baileys para comunicação com o WhatsApp e, portanto, não utiliza a WhatsApp Business Platform (API oficial).
