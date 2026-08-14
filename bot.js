const { useMultiFileAuthState, DisconnectReason, makeWASocket } = require('@whiskeysockets/baileys');
const { Groq } = require('groq-sdk');
const axios = require('axios');
const fs = require('fs');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PREFIX = '.';

const startBot = async (userId, phoneNumber, io, socket) => {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${userId}`);

    const sock = makeWASocket({ auth: state, printQRInTerminal: false });

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, isNewLogin } = update;
        if(qr) socket.emit('qr', qr);
        if(isNewLogin) {
            const code = await sock.requestPairingCode(phoneNumber);
            socket.emit('pairing_code', code);
        }
        if(connection === 'open') socket.emit('connected');
        if(connection === 'close') socket.emit('disconnected');
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if(!m.message || m.key.fromMe) return;

        const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
        if(!text.startsWith(PREFIX)) return;

        const [command,...args] = text.slice(PREFIX.length).trim().split(' ');
        const from = m.key.remoteJid;
        const body = args.join(' ');

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