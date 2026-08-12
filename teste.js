const axios = require('axios');

async function testar() {
    try {
        console.log("Simulando mensagem 'Menu'...");
        await axios.post('http://localhost:3000/webhook', {
            object: "whatsapp_business_account",
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: "5511999999999",
                            type: "text",
                            text: { body: "Menu" }
                        }],
                        contacts: [{ profile: { name: "Eduardo Simulacao" } }]
                    }
                }]
            }]
        });
        console.log("✅ Mensagem enviada para o servidor local!");
    } catch (e) {
        console.error("Erro:", e.message);
    }
}

testar();