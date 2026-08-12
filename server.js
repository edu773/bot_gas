require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path'); // Importante para servir o HTML

const app = express();
app.use(bodyParser.json());
// Serve arquivos estáticos (HTML, CSS) da pasta atual
app.use(express.static(path.join(__dirname)));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('Erro no Banco:', err));

// --- CONFIGURAÇÕES ---
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const STATES = {
    INICIO: 'INICIO', PRODUTO: 'PRODUTO', QUANTIDADE: 'QUANTIDADE',
    ENDERECO: 'ENDERECO', DIGITANDO_ENDERECO: 'DIGITANDO_ENDERECO', PAGAMENTO: 'PAGAMENTO'
};

const PRODUTOS = {
    GAS: { id: 'gas_13kg', nome: 'Gás 13Kg', preco: 100 },
    AGUA: { id: 'agua_20l', nome: 'Água 20L', preco: 12 }
};

// --- ROTA DE API (Para o Dashboard) ---
app.get('/api/pedidos', async (req, res) => {
    try {
        // Pega os últimos 10 pedidos, mais recentes primeiro
        const result = await pool.query('SELECT * FROM pedidos ORDER BY id DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- WEBHOOK ---
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    console.log("🔔 WEBHOOK ACIONADO! Alguém bateu na porta."); // <--- LOG 1
    
    // Responde 200 imediatamente
    res.sendStatus(200);

    const body = req.body;
    
    // Vamos ver o que chegou exatamente
    console.log("📦 Payload recebido:", JSON.stringify(body, null, 2)); // <--- LOG 2

    try {
        if (!body.object) {
            console.log("❌ Erro: O corpo não tem 'object'. Ignorando."); // <--- LOG 3
            return;
        }

        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (value?.statuses) {
            console.log("ℹ️ É apenas um status update (Lido/Entregue)."); // <--- LOG 4
            return;
        }

        if (value?.messages?.[0]) {
            console.log("📨 É UMA MENSAGEM! Processando..."); // <--- LOG 5
            
            const msg = value.messages[0];
            const from = msg.from;
            const nome = value.contacts?.[0]?.profile?.name || "Cliente";
            
            let input = "";
            if (msg.type === 'text') input = msg.text.body;
            else if (msg.type === 'interactive') input = msg.interactive.button_reply?.id;
            
            console.log(`🧠 Texto extraído: "${input}" de ${nome}`); // <--- LOG 6

            await processarMensagem(from, nome, input);
        } else {
            console.log("⚠️ O payload tem estrutura estranha (sem messages)."); // <--- LOG 7
        }
    } catch (err) {
        console.error("🔥 ERRO FATAL NO PROCESSAMENTO:", err);
    }
});
// --- LÓGICA DE NEGÓCIO ---
async function processarMensagem(from, nome, inputRaw) {
    const input = inputRaw ? inputRaw.toString().trim().toLowerCase() : "";
    let cliente = await getCliente(from, nome);
    let fase = cliente.fase_conversa;

    if (['oi', 'menu', 'reset'].includes(input)) {
        fase = STATES.INICIO;
        await updateFase(from, STATES.INICIO);
    }

    switch (fase) {
        case STATES.INICIO:
            await enviarMensagem(from, `Olá *${nome}*! O que deseja?`, [PRODUTOS.GAS.nome, PRODUTOS.AGUA.nome]);
            await updateFase(from, STATES.PRODUTO);
            break;
        case STATES.PRODUTO:
            const item = (input.includes('gas') || input.includes('gás')) ? PRODUTOS.GAS.nome : 
                         (input.includes('agua') || input.includes('água')) ? PRODUTOS.AGUA.nome : null;
            if (item) {
                await pool.query('UPDATE clientes SET ultimo_pedido_item = $1 WHERE telefone = $2', [item, from]);
                await enviarMensagem(from, `Quantas unidades de ${item}?`, ["1 Unidade", "2 Unidades"]);
                await updateFase(from, STATES.QUANTIDADE);
            }
            break;
        case STATES.QUANTIDADE:
            const qtd = parseInt(input.replace(/\D/g, '')) || 1;
            await pool.query('UPDATE clientes SET temp_quantidade = $1 WHERE telefone = $2', [qtd, from]);
            const c = await getCliente(from);
            if (c.endereco) {
                await enviarMensagem(from, `Entregar em:\n${c.endereco}?`, ["Sim", "Novo Endereço"]);
                await updateFase(from, STATES.ENDERECO);
            } else {
                await enviarMensagem(from, "Digite o endereço:");
                await updateFase(from, STATES.DIGITANDO_ENDERECO);
            }
            break;
        case STATES.ENDERECO:
            if (input.includes('sim')) await irParaPagamento(from);
            else {
                await enviarMensagem(from, "Digite o novo endereço:");
                await updateFase(from, STATES.DIGITANDO_ENDERECO);
            }
            break;
        case STATES.DIGITANDO_ENDERECO:
            await pool.query('UPDATE clientes SET endereco = $1 WHERE telefone = $2', [inputRaw, from]);
            await irParaPagamento(from);
            break;
        case STATES.PAGAMENTO:
            if (['pix', 'cartão', 'dinheiro'].some(x => input.includes(x))) {
                await finalizarPedido(from, inputRaw, nome);
            }
            break;
    }
}

async function irParaPagamento(from) {
    const c = await getCliente(from);
    const preco = c.ultimo_pedido_item === PRODUTOS.GAS.nome ? PRODUTOS.GAS.preco : PRODUTOS.AGUA.preco;
    await enviarMensagem(from, `Total: R$ ${preco * c.temp_quantidade},00. Forma de Pagamento?`, ["Pix", "Cartão", "Dinheiro"]);
    await updateFase(from, STATES.PAGAMENTO);
}

async function finalizarPedido(from, metodo, nome) {
    try {
        console.log("🏁 INICIANDO FINALIZAÇÃO DO PEDIDO...");
        console.log(`👤 Cliente: ${nome} (${from})`);
        console.log(`💳 Método Raw: ${metodo}`);

        // 1. Recupera dados do cliente
        const c = await getCliente(from);
        console.log("📋 Dados recuperados do banco:", JSON.stringify(c));

        // Verificação de Segurança (Valores Nulos)
        if (!c.ultimo_pedido_item) {
            console.error("❌ ERRO: O item do pedido sumiu do banco!");
            await enviarMensagem(from, "Ops! Não achei seu item. Digite 'Menu' para começar de novo.");
            return;
        }

        // 2. Calcula Totais
        const preco = (c.ultimo_pedido_item === PRODUTOS.GAS.nome) ? PRODUTOS.GAS.preco : PRODUTOS.AGUA.preco;
        const total = preco * (c.temp_quantidade || 1);
        
        console.log(`💰 Cálculo: ${c.temp_quantidade}x ${preco} = R$ ${total}`);

        // 3. TENTA INSERIR (O Momento da Verdade)
        console.log("💾 Tentando INSERT no banco...");
        
        const query = `
            INSERT INTO pedidos (cliente_telefone, cliente_nome, item, quantidade, endereco, valor_total, metodo_pagamento) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `;
        const values = [from, nome, c.ultimo_pedido_item, c.temp_quantidade || 1, c.endereco || "Sem endereço", total, metodo];

        const res = await pool.query(query, values);
        
        console.log(`✅ SUCESSO! Pedido inserido com ID: ${res.rows[0].id}`);

        // 4. Avisa (mesmo que falhe o envio, o banco já salvou)
        await enviarMensagem(from, `✅ Pedido Confirmado! Em breve entregaremos.`);
        await updateFase(from, STATES.INICIO);

    } catch (err) {
        console.error("🔥 ERRO FATAL AO INSERIR PEDIDO:", err.message);
        console.error("Detalhes do erro:", err);
    }
}

// --- AUXILIARES ---
async function enviarMensagem(to, texto, botoes) {
    try {
        const data = { messaging_product: "whatsapp", to, type: botoes ? "interactive" : "text" };
        if (botoes) {
            data.interactive = { type: "button", body: { text: texto }, action: { buttons: botoes.map(b => ({ type: "reply", reply: { id: b.toLowerCase().replace(/ /g,'_'), title: b } })) } };
        } else {
            data.text = { body: texto };
        }
        await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, data, { headers: { Authorization: `Bearer ${TOKEN}` } });
    } catch (e) { console.error("Erro envio (ignorável sem CNPJ):", e.response?.data?.error?.message || e.message); }
}

async function getCliente(telefone, nome = "Cliente") {
    const res = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [telefone]);
    if (res.rows.length === 0) {
        return (await pool.query('INSERT INTO clientes (telefone, nome, fase_conversa) VALUES ($1, $2, $3) RETURNING *', [telefone, nome, STATES.INICIO])).rows[0];
    }
    return res.rows[0];
}

async function updateFase(tel, fase) { await pool.query('UPDATE clientes SET fase_conversa = $1 WHERE telefone = $2', [fase, tel]); }

app.listen(3000, () => console.log('🚀 Servidor rodando na porta 3000'));