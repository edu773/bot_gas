require('dotenv').config();
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    fetchLatestWaWebVersion, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { Pool } = require('pg');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Configuração do Banco de Dados
const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL
});

// Constantes de Negócio
const CATALOGO = {
    GAS: { nome: 'Gás 13Kg', preco: 100 },
    AGUA: { nome: 'Água 20L', preco: 12 }
};

const STATES = {
    INICIO: 'INICIO',
    ESCOLHENDO_PRODUTO: 'ESCOLHENDO_PRODUTO',
    ESCOLHENDO_QUANTIDADE: 'ESCOLHENDO_QUANTIDADE',
    CONFIRMA_ENDERECO: 'CONFIRMA_ENDERECO',
    DIGITANDO_ENDERECO: 'DIGITANDO_ENDERECO',
    PAGAMENTO_TIPO: 'PAGAMENTO_TIPO'
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // Sincronização dinâmica de versão
    const { version, isLatest } = await fetchLatestWaWebVersion();
    console.log(`Versão do WA Web sincronizada: ${version.join('.')} (Última: ${isLatest})`);

    const sock = makeWASocket({
        version,
        auth: state,
        browser: ['BotGas', 'Chrome', '1.0.0'],
        logger: pino({ level: 'error' }), // Silencia ruídos de background
        syncFullHistory: false // Desativa sync pesado de histórico inicial
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("NOVO QR CODE GERADO. Escaneie com seu WhatsApp:");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
                : true;
            
            console.log(`Conexão encerrada. Motivo: ${lastDisconnect?.error?.message || 'Desconhecido'}. Reconectando: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                console.log('Sessão encerrada definitivamente pelo usuário (Logged Out).');
            }
        } else if (connection === 'open') {
            console.log('✅ SISTEMA OPERANTE. Aguardando interações...');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe || m.key.remoteJid.includes('@g.us')) return;

        const jid = m.key.remoteJid;
        const texto = m.message.conversation || m.message.extendedTextMessage?.text || "";
        const nome = m.pushName || "Cliente";

        if (!texto) return;

        try {
            await processarMensagem(sock, jid, nome, texto);
        } catch (error) {
            console.error(`Erro ao processar mensagem de ${jid}:`, error.message);
        }
    });
}

async function processarMensagem(sock, jid, nome, textoRaw) {
    const input = textoRaw.trim().toLowerCase();
    let cliente = await getCliente(jid, nome);
    let faseAtual = cliente.fase_conversa;

    if (input === 'menu') {
        await updateFase(jid, STATES.INICIO);
        faseAtual = STATES.INICIO;
    }

    if (faseAtual === STATES.INICIO && input !== 'menu') return;

    await sock.sendPresenceUpdate('composing', jid);
    await delay(1000);

    switch (faseAtual) {
        case STATES.INICIO:
            await sock.sendMessage(jid, { 
                text: `Olá, ${nome}!\nO que você deseja pedir hoje?\n\n1. *${CATALOGO.GAS.nome}*\n2. *${CATALOGO.AGUA.nome}*` 
            });
            await updateFase(jid, STATES.ESCOLHENDO_PRODUTO);
            break;

        case STATES.ESCOLHENDO_PRODUTO:
            const item = (input === '1' || input.includes('gas')) ? CATALOGO.GAS.nome : 
                         (input === '2' || input.includes('agua')) ? CATALOGO.AGUA.nome : null;
            
            if (item) {
                await pool.query('UPDATE clientes SET ultimo_pedido_item = $1 WHERE telefone = $2', [item, jid]);
                await sock.sendMessage(jid, { text: `Ótima escolha: *${item}*.\nQuantas unidades você precisa?` });
                await updateFase(jid, STATES.ESCOLHENDO_QUANTIDADE);
            }
            break;

        case STATES.ESCOLHENDO_QUANTIDADE:
            const qtd = parseInt(input.replace(/\D/g, ''));
            if (qtd > 0) {
                await pool.query('UPDATE clientes SET temp_quantidade = $1 WHERE telefone = $2', [qtd, jid]);
                const cli = await getCliente(jid, nome);

                if (cli.endereco) {
                    await sock.sendMessage(jid, { 
                        text: `Confirmar entrega em:\n*${cli.endereco}*?\n\n1. Sim, confirmar\n2. Não, mudar endereço` 
                    });
                    await updateFase(jid, STATES.CONFIRMA_ENDERECO);
                } else {
                    await sock.sendMessage(jid, { text: `Digite o seu endereço de entrega (Rua, número e bairro):` });
                    await updateFase(jid, STATES.DIGITANDO_ENDERECO);
                }
            }
            break;

        case STATES.CONFIRMA_ENDERECO:
            if (input === '1' || input.includes('sim')) {
                await fluxoPagamento(sock, jid);
            } else {
                await sock.sendMessage(jid, { text: `Certo, digite o novo endereço completo:` });
                await updateFase(jid, STATES.DIGITANDO_ENDERECO);
            }
            break;

        case STATES.DIGITANDO_ENDERECO:
            await pool.query('UPDATE clientes SET endereco = $1 WHERE telefone = $2', [textoRaw, jid]);
            await fluxoPagamento(sock, jid);
            break;

        case STATES.PAGAMENTO_TIPO:
            const metodo = input === '1' ? 'Pix' : input === '2' ? 'Cartão' : 'Dinheiro';
            await finalizarPedido(sock, jid, metodo);
            break;
    }
}

async function fluxoPagamento(sock, jid) {
    const res = await pool.query('SELECT ultimo_pedido_item, temp_quantidade FROM clientes WHERE telefone = $1', [jid]);
    const c = res.rows[0];
    const valor = c.ultimo_pedido_item === CATALOGO.GAS.nome ? CATALOGO.GAS.preco : CATALOGO.AGUA.preco;
    const total = valor * c.temp_quantidade;

    await sock.sendMessage(jid, { 
        text: `💰 *Total: R$ ${total},00*\n\nComo deseja pagar?\n1. Pix\n2. Cartão\n3. Dinheiro` 
    });
    await updateFase(jid, STATES.PAGAMENTO_TIPO);
}

async function finalizarPedido(sock, jid, metodo) {
    const res = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [jid]);
    const c = res.rows[0];
    const valor = c.ultimo_pedido_item === CATALOGO.GAS.nome ? CATALOGO.GAS.preco : CATALOGO.AGUA.preco;
    
    const resumo = `✅ *PEDIDO RECEBIDO!*\n\n📦 *Item:* ${c.ultimo_pedido_item}\n🔢 *Qtd:* ${c.temp_quantidade}\n📍 *End:* ${c.endereco}\n💵 *Total:* R$ ${valor * c.temp_quantidade},00\n💳 *Pgto:* ${metodo}\n\nEntregaremos em breve! Digite *Menu* para um novo pedido.`;
    
    await sock.sendMessage(jid, { text: resumo });
    await updateFase(jid, STATES.INICIO);
}

// Interações com Banco de Dados
async function getCliente(jid, nome) {
    const res = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [jid]);
    if (res.rows.length === 0) {
        await pool.query('INSERT INTO clientes (telefone, nome, fase_conversa) VALUES ($1, $2, $3)', [jid, nome, STATES.INICIO]);
        return (await pool.query('SELECT * FROM clientes WHERE telefone = $1', [jid])).rows[0];
    }
    return res.rows[0];
}

async function updateFase(jid, fase) {
    await pool.query('UPDATE clientes SET fase_conversa = $1 WHERE telefone = $2', [fase, jid]);
}

connectToWhatsApp().catch(err => {
    console.error("Falha crítica na inicialização:", err.message);
    process.exit(1);
});