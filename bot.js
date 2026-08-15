const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

async function startBot(userId, phone, io, socket) {
    const { state, saveCreds } = await useMultiFileAuthState(`auth_info_${userId}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            socket.emit('qr', qr);
        }

        // Generate real WhatsApp pairing code
        if (!sock.authState.creds.registered && phone) {
            try {
                // Strip '+' or extra symbols (must be pure numbers: e.g. 233597789459)
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                
                // Slight delay to ensure socket readiness
                setTimeout(async () => {
                    try {
                        const code = await sock.requestPairingCode(cleanPhone);
                        socket.emit('pairing_code', code);
                    } catch (err) {
                        console.error('Error fetching code:', err);
                        socket.emit('status', 'Failed to generate code. Check phone number.');
                    }
                }, 3000);
            } catch (err) {
                console.error('Pairing error:', err);
            }
        }

        if (connection === 'open') {
            socket.emit('connected');
            socket.emit('status', 'Connected!');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            socket.emit('disconnected');
            if (shouldReconnect) {
                startBot(userId, phone, io, socket);
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (text.toLowerCase() === '.menu') {
                await sock.sendMessage(from, { text: '⚡ *CLOUDBOT MENU*\n\n- .ping\n- .status\n- .help' });
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    return sock;
}

function stopBot(userId) {
    // Clear instance if needed
}

module.exports = { startBot, stopBot };
