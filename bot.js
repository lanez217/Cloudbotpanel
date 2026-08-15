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

        // Request pairing code if not registered
        if (!sock.authState.creds.registered && phone) {
            try {
                // Request pairing code using formatted phone number
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanPhone);
                socket.emit('pairing_code', code || 'LANEZ');
            } catch (err) {
                console.error('Error requesting pairing code:', err);
                socket.emit('pairing_code', 'LANEZ');
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

    // Handle messages (Fixed: marked handler as async)
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
    // Logic to clear instance/auth if needed
}

module.exports = { startBot, stopBot };
            
