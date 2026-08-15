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

        // Generate official 8-character WhatsApp pairing code
        if (!sock.authState.creds.registered && phone) {
            try {
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                
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

    // Handle messages & commands (Allows self-messages)
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return; // Removed msg.key.fromMe check

            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim().toLowerCase();

            if (text === '.menu' || text === '.help') {
                await sock.sendMessage(from, { text: '⚡ *CLOUDBOT MENU*\n\n- .ping\n- .pong\n- .status\n- .help' });
            } else if (text === '.ping') {
                await sock.sendMessage(from, { text: '🏓 *Pong!* Bot is alive and active.' });
            } else if (text === '.pong') {
                await sock.sendMessage(from, { text: '🏓 *Ping!*' });
            } else if (text === '.status') {
                await sock.sendMessage(from, { text: '🟢 *CloudBot Status:* Online & Syncing' });
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    return sock;
}

function stopBot(userId) {
    // Instance cleanup logic if needed
}

module.exports = { startBot, stopBot };
