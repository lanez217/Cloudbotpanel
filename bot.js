const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage, Browsers } = require('@whiskeysockets/baileys');
const yts = require('yt-search');
const fs = require('fs');

// Store active instances in memory
const activeBots = {};

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

    activeBots[userId] = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) socket.emit('qr', qr);

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

    // --- COMMAND LIST ---
    const commands = {
        ping: async (s, f) => await s.sendMessage(f, { text: '🏓 *Pong!* Bot is active & fast.' }),
        status: async (s, f) => await s.sendMessage(f, { text: '🟢 *CloudBot Status:* Active & Connected' }),
        uptime: async (s, f) => await s.sendMessage(f, { text: `⏱️ *Uptime:* ${Math.floor(process.uptime())}s` }),
        owner: async (s, f) => await s.sendMessage(f, { text: '👑 *Bot Owner:* Lanez' }),

        vv: async (s, f, msg) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const viewOnceMedia = quoted?.viewOnceMessageV2?.message || quoted?.viewOnceMessage?.message;

            if (!viewOnceMedia) return await s.sendMessage(f, { text: '⚠️ Reply to a View Once message with `.vv`' });

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
            if (!query) return await s.sendMessage(f, { text: '⚠️ Provide a song name!' });

            await s.sendMessage(f, { text: `🔍 *Searching:* "${query}"...` });
            const r = await yts(query);
            const video = r.videos[0];

            if (!video) return await s.sendMessage(f, { text: '❌ No results found.' });
            await s.sendMessage(f, { image: { url: video.thumbnail }, caption: `🎵 *${video.title}*\n⏱️ ${video.timestamp}\n🔗 ${video.url}` });
        }
    };

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

            if (!text.startsWith('.')) return;

            const args = text.slice(1).split(/ +/);
            const cmd = args.shift().toLowerCase();

            if (cmd === 'menu') {
                return await s.sendMessage(from, { text: '⚡ *CLOUDBOT PRO PANEL*\n.ping\n.status\n.uptime\n.vv\n.play <song>' });
            }

            if (commands[cmd]) await commands[cmd](sock, from, msg, args);
        } catch (err) {
            console.error('Message error:', err);
        }
    });

    return sock;
}

// Dedicated function to request pairing code safely
async function requestPairingCodeExplicit(userId, phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const sock = activeBots[userId];

    if (!sock) throw new Error('Socket instance not initialized.');

    // Give socket 5 seconds to settle if fresh
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await sock.requestPairingCode(cleanPhone);
}

module.exports = { startBot, requestPairingCodeExplicit };
            
