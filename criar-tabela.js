require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        cliente_telefone VARCHAR(20),
        cliente_nome VARCHAR(100),
        item VARCHAR(50),
        quantidade INTEGER,
        endereco TEXT,
        valor_total INTEGER,
        metodo_pagamento VARCHAR(20),
        status VARCHAR(20) DEFAULT 'PENDENTE',
        data_pedido TIMESTAMP DEFAULT NOW()
    );
`).then(() => {
    console.log("✅ Tabela 'pedidos' criada com sucesso!");
    process.exit();
}).catch(err => console.error(err));