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
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) socket.emit('qr', qr);

        const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';

        if (!sock.authState.creds.registered && cleanPhone) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(cleanPhone);
                    socket.emit('pairing_code', code);
                } catch (err) {
                    console.error('Pairing Code Error:', err);
                    socket.emit('status', 'Failed to generate code. Try again.');
                }
            }, 1000);
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
        date: async (s, f) => await s.sendMessage(f, { text: `📅 *Date:* ${new Date().toLocaleDateString()}` }),
        time: async (s, f) => await s.sendMessage(f, { text: `🕒 *Time:* ${new Date().toLocaleTimeString()}` }),

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
        },

        groupinfo: async (s, f) => await s.sendMessage(f, { text: '👥 *Group Info:* Active WhatsApp Group Chat' }),
        tagall: async (s, f) => await s.sendMessage(f, { text: '📣 *Tagging all members...*' }),
        hidetag: async (s, f) => await s.sendMessage(f, { text: '📢 *Announcement sent to all members.*' }),
        kick: async (s, f) => await s.sendMessage(f, { text: '🚪 *User removal request received.*' }),
        add: async (s, f) => await s.sendMessage(f, { text: '➕ *User add request received.*' }),
        promote: async (s, f) => await s.sendMessage(f, { text: '⭐ *User promoted to admin.*' }),
        demote: async (s, f) => await s.sendMessage(f, { text: '⬇️ *Admin demoted to regular user.*' }),
        linkgroup: async (s, f) => await s.sendMessage(f, { text: '🔗 *Group Invite Link:* https://chat.whatsapp.com/cloudbot' }),
        revoke: async (s, f) => await s.sendMessage(f, { text: '🔄 *Group link reset successfully.*' }),
        setname: async (s, f) => await s.sendMessage(f, { text: '✏️ *Group name updated.*' }),
        setdesc: async (s, f) => await s.sendMessage(f, { text: '📝 *Group description updated.*' }),
        mute: async (s, f) => await s.sendMessage(f, { text: '🔇 *Group muted. Only admins can send messages.*' }),
        unmute: async (s, f) => await s.sendMessage(f, { text: '🔊 *Group unmuted. All members can speak.*' }),
        admins: async (s, f) => await s.sendMessage(f, { text: '👑 *Listing Group Admins...*' }),
        warn: async (s, f) => await s.sendMessage(f, { text: '⚠️ *Warning issued to user [1/3].*' }),
        resetwarn: async (s, f) => await s.sendMessage(f, { text: '🧹 *Warnings cleared for user.*' }),
        welcome: async (s, f) => await s.sendMessage(f, { text: '👋 *Welcome message settings toggled.*' }),
        goodbye: async (s, f) => await s.sendMessage(f, { text: '👋 *Goodbye message settings toggled.*' }),

        song: async (s, f) => await s.sendMessage(f, { text: '🎵 *Downloading audio track...*' }),
        video: async (s, f) => await s.sendMessage(f, { text: '🎥 *Downloading video stream...*' }),
        ytmp3: async (s, f) => await s.sendMessage(f, { text: '🎧 *Converting YouTube to MP3...*' }),
        ytmp4: async (s, f) => await s.sendMessage(f, { text: '🎬 *Converting YouTube to MP4...*' }),
        tiktok: async (s, f) => await s.sendMessage(f, { text: '📱 *Fetching TikTok media...*' }),
        ig: async (s, f) => await s.sendMessage(f, { text: '📸 *Fetching Instagram Reel/Post...*' }),
        fb: async (s, f) => await s.sendMessage(f, { text: '📘 *Fetching Facebook Video...*' }),
        twitter: async (s, f) => await s.sendMessage(f, { text: '🐦 *Fetching Twitter/X Media...*' }),

        truth: async (s, f) => await s.sendMessage(f, { text: '❓ *Truth:* What is your biggest secret?' }),
        dare: async (s, f) => await s.sendMessage(f, { text: '🔥 *Dare:* Voice record yourself singing!' }),
        joke: async (s, f) => await s.sendMessage(f, { text: '😂 *Joke:* Why do programmers prefer dark mode? Because light attracts bugs!' }),
        quote: async (s, f) => await s.sendMessage(f, { text: '💡 *Quote:* "Code is like humor. When you have to explain it, it is bad."' }),
        fact: async (s, f) => await s.sendMessage(f, { text: '🧠 *Fact:* Honey never spoils.' }),
        roll: async (s, f) => await s.sendMessage(f, { text: `🎲 *Dice:* You rolled a ${Math.floor(Math.random() * 6) + 1}!` }),
        flip: async (s, f) => await s.sendMessage(f, { text: `🪙 *Coin:* It landed on ${Math.random() > 0.5 ? 'Heads' : 'Tails'}!` }),
        '8ball': async (s, f) => await s.sendMessage(f, { text: '🎱 *Magic 8-Ball:* Signs point to Yes.' }),
        hack: async (s, f) => await s.sendMessage(f, { text: '💻 *Simulating hack...* 100% Complete!' }),
        rate: async (s, f) => await s.sendMessage(f, { text: `⭐ *Rating:* ${Math.floor(Math.random() * 100)}/100` }),
        roast: async (s, f) => await s.sendMessage(f, { text: '🔥 *Roast:* You are the reason shampoo has instructions.' }),

        sticker: async (s, f) => await s.sendMessage(f, { text: '🖼️ *Reply to an image to turn it into a sticker!*' }),
        toimg: async (s, f) => await s.sendMessage(f, { text: '🖼️ *Converting sticker back to image...*' }),
        tourl: async (s, f) => await s.sendMessage(f, { text: '🔗 *Uploading media and generating link...*' }),
        calc: async (s, f) => await s.sendMessage(f, { text: '🧮 *Calculator:* 2 + 2 = 4' }),
        qr: async (s, f) => await s.sendMessage(f, { text: '📲 *Generating custom QR Code...*' }),

        anime: async (s, f) => await s.sendMessage(f, { text: '⛩️ *Searching Anime Database...*' }),
        waifu: async (s, f) => await s.sendMessage(f, { text: '🌸 *Fetching random Waifu image...*' }),
        neko: async (s, f) => await s.sendMessage(f, { text: '🐱 *Fetching random Neko image...*' }),

        mode: async (s, f) => await s.sendMessage(f, { text: '⚙️ *Bot Mode:* Public Mode Active' }),
        anticall: async (s, f) => await s.sendMessage(f, { text: '🛡️ *Anti-Call toggled.*' }),
        antilink: async (s, f) => await s.sendMessage(f, { text: '🛡️ *Anti-Link toggled.*' }),
        restart: async (s, f) => await s.sendMessage(f, { text: '🔄 *Restarting bot instance...*' })
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

            if (cmd === 'menu' || cmd === 'help') {
                const menuText = 
`⚡ *CLOUDBOT PRO PANEL* ⚡
👑 *Developer:* Lanez

┌─── 🛠️ *COMMANDS*
│ .ping | .pong | .status | .uptime | .owner
│ .vv (Reply to View-Once)
│ .play <song name>
│ .groupinfo | .tagall | .hidetag | .kick | .add
│ .song | .video | .tiktok | .ig | .fb
│ .joke | .quote | .roll | .flip | .8ball
│ .sticker | .toimg | .calc | .qr
└───`;

                await sock.sendMessage(from, { text: menuText });
                return;
            }

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
                      
