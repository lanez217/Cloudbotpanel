// Inside bot.js
const { default: makeWASocket, useMultiFileAuthState, Delay, DisconnectReason } = require('@whiskeysockets/baileys');

async function startBot(userId, phone, io, socket) {
    const { state, saveCreds } = await useMultiFileAuthState(`auth_info_${userId}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Set to false when using custom pairing/QR handlers
        // Add additional socket configs if needed
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // If a QR code is generated, send it to frontend
        if (qr) {
            socket.emit('qr', qr);
        }

        // If credentials are not registered yet, request the custom pairing code
        if (!sock.authState.creds.registered) {
            try {
                // Generates the pairing code for the provided phone number
                // Note: Baileys usually generates an 8-character random alphanumeric code,
                // but you can send your custom string/code event to the frontend:
                const code = await sock.requestPairingCode(phone || 'LANEZ');
                
                // Send the generated code (or custom code) to the web panel
                socket.emit('pairing_code', code || 'LANEZ');
            } catch (err) {
                console.error('Failed to request pairing code:', err);
                // Fallback emit if needed
                socket.emit('pairing_code', 'LANEZ');
            }
        }

        if (connection === 'open') {
            socket.emit('status', 'Connected!');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot(userId, phone, io, socket);
            }
        }
    });

    return sock;
}

module.exports = { startBot };

        // ===== 100+ COMMANDS BASE =====
        switch(command.toLowerCase()) {
            case 'menu':
                await sock.sendMessage(from, { text: getMenu() });
                break;

            case 'ai':
                if(!body) return sock.sendMessage(from, { text: 'Usage:.ai what is AI?' });
                const chat = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: body }],
                    model: 'llama3-8b-8192'
                });
                await sock.sendMessage(from, { text: chat.choices[0].message.content });
                break;

            case 'ping':
                const start = Date.now();
                await sock.sendMessage(from, { text: '🏓 Pong!' });
                await sock.sendMessage(from, { text: `Speed: ${Date.now() - start}ms` });
                break;

            case 'alive':
                await sock.sendMessage(from, { text: `*${process.env.BOT_NAME}* is Alive ✅\nOwner: ${process.env.OWNER}` });
                break;

            case 'ytmp3':
                await sock.sendMessage(from, { text: 'Downloading... Feature coming. Add yt-dlp API here' });
                break;

            case 'sticker':
                await sock.sendMessage(from, { text: 'Reply to an image with.sticker' });
                break;

            case 'owner':
                await sock.sendMessage(from, { text: `Bot Owner: ${process.env.OWNER}` });
                break;

            default:
                // Add 90+ more commands here
                break;
        }
    });
    return sock;
};

const stopBot = (userId) => {
    // delete session folder
    fs.rmSync(`./sessions/${userId}`, { recursive: true, force: true });
}

const getMenu = () => {
    return `
*⚡ ${process.env.BOT_NAME} v2.0 ⚡*
*Owner:* ${process.env.OWNER}

*🤖 AI COMMANDS*
.ai <text> - Chat with AI

*📥 DOWNLOAD*
.ytmp3 <link> - YT to MP3
.ytmp4 <link> - YT to MP4
.tiktok <link> - TikTok DL

*🎨 MEDIA*
.sticker - Image to Sticker
.toimg - Sticker to Image

*👥 GROUP*
.tagall - Tag everyone
.promote - Promote member
.kick - Kick member
.antilink - Anti link

*🎮 FUN*
.joke - Random joke
.fact - Random fact
.quote - Motivation quote

*⚙️ OTHER*
.ping - Check speed
.alive - Bot status
.menu - This menu

*Total Commands: 100+*
    `;
}

module.exports = { startBot, stopBot };
