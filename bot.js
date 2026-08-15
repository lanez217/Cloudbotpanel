const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const yts = require('yt-search');
const fs = require('fs');

async function startBot(userId, phone, io, socket) {
    const authFolder = `auth_info_${userId}`;
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    let codeRequested = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) socket.emit('qr', qr);

        const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';

        // Request pairing code only when socket initial handshake is active and not yet registered
        if (!sock.authState.creds.registered && cleanPhone && !codeRequested) {
            codeRequested = true;
            // Wait 3 seconds to ensure WebSocket handshake completes before requesting code
            setTimeout(async () => {
                try {
                    if (sock?.ws?.isOpen) {
                        const code = await sock.requestPairingCode(cleanPhone);
                        socket.emit('pairing_code', code);
                    } else {
                        // Retry once if socket was still warming up
                        setTimeout(async () => {
                            try {
                                const code = await sock.requestPairingCode(cleanPhone);
                                socket.emit('pairing_code', code);
                            } catch (retryErr) {
                                console.error('Pairing Code Retry Error:', retryErr);
                                socket.emit('status', 'Failed to generate code. Try again.');
                            }
                        }, 2000);
                    }
                } catch (err) {
                    console.error('Pairing Code Error:', err);
                    socket.emit('status', 'Failed to generate code. Try again.');
                }
            }, 3000);
        }

        if (connection === 'open') {
            socket.emit('connected');
            socket.emit('status', 'Connected Successfully!');
        } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            socket.emit('disconnected');

            if (statusCode === DisconnectReason.loggedOut) {
                if (fs.existsSync(authFolder)) {
                    fs.rmSync(authFolder, { recursive: true, force: true });
                }
            }

            if (shouldReconnect) {
                startBot(userId, phone, io, socket);
            }
        }
    });

    const commands = {
        ping: async (s, f) => await s.sendMessage(f, { text: '🏓 *Pong!* Bot is active & fast.' }),
        pong: async (s, f) => await s.sendMessage(f, { text: '🏓 *Ping!*' }),
        status: async (s, f) => await s.sendMessage(f, { text: '🟢 *CloudBot Status:* Active & Connected' }),
        uptime: async (s, f) => await s.sendMessage(f, { text: `⏱️ *Uptime:* ${Math.floor(process.uptime())}s` }),
        owner: async (s, f) => await s.sendMessage(f, { text: '👑 *Bot Owner:* Lanez' }),
        botinfo: async (s, f) => await s.sendMessage(f, { text: '⚡ *CloudBot Pro v2.0* - Powered by Baileys' }),

        vv: async (s, f, msg) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const viewOnceMedia = quoted?.viewOnceMessageV2?.message || quoted?.viewOnceMessage?.message;

            if (!viewOnceMedia) {
                return await s.sendMessage(f, { text: '⚠️ Please reply to a *View Once* image/video with `.vv`' });
            }

            const mediaType = Object.keys(viewOnceMedia)[0];
            const stream = await downloadContentFromMessage(viewOnceMedia[mediaType], mediaType.replace('Message', ''));
            
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (mediaType === 'imageMessage') {
                await s.sendMessage(f, { image: buffer, caption: '🔓 *View-Once Unlocked*' });
            } else if (mediaType === 'videoMessage') {
                await s.sendMessage(f, { video: buffer, caption: '🔓 *View-Once Unlocked*' });
            }
        },

        play: async (s, f, msg, args) => {
            const query = args.join(' ');
            if (!query) return await s.sendMessage(f, { text: '⚠️ Provide a song name! Example: `.play Roxanne`' });

            await s.sendMessage(f, { text: `🔍 *Searching YouTube:* "${query}"...` });
            const r = await yts(query);
            const video = r.videos[0];

            if (!video) return await s.sendMessage(f, { text: '❌ No results found.' });

            const caption = `🎵 *Track Found!*\n\n📌 *Title:* ${video.title}\n⏱️ *Duration:* ${video.timestamp}\n🔗 *URL:* ${video.url}`;
            await s.sendMessage(f, { image: { url: video.thumbnail }, caption: caption });
        }
    };

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            const from = msg.key.remoteJid;
            const text = (
                msg.message.conversation || 
                msg.message.extendedTextMessage?.text || 
                msg.message.imageMessage?.caption || 
                ''
            ).trim();

            if (!text.startsWith('.')) return;

            const args = text.slice(1).split(/ +/);
            const cmd = args.shift().toLowerCase();

            if (commands[cmd]) {
                await commands[cmd](sock, from, msg, args);
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    return sock;
}

function stopBot(userId) {}

module.exports = { startBot, stopBot };
                            
