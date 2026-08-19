require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const criarTabelaClientes = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS clientes (
            id SERIAL PRIMARY KEY,
            telefone VARCHAR(50) UNIQUE NOT NULL,
            nome VARCHAR(100),
            fase_conversa VARCHAR(50) DEFAULT 'INICIO',
            ultimo_pedido_item VARCHAR(100),
            temp_quantidade INT DEFAULT 0,
            endereco TEXT,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        console.log('⏳ Conectando ao banco de dados...');
        await pool.query(query);
        console.log('✅ Tabela "clientes" verificada/criada com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao criar a tabela:', error.message);
    } finally {
        await pool.end();
        console.log('🔌 Conexão com o banco encerrada.');
    }
};

criarTabelaClientes();