const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()

const PORT = process.env.PORT || 3000
const BOT_NAME = 'LANEZ'
const PHONE_NUMBER = '233XXXXXXXXX' // <-- CHANGE THIS to your WhatsApp number. Example: '233557891234'

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: [BOT_NAME, 'Chrome', '20.0.0'] // This makes it show as LANEZ
    })

    sock.ev.on('creds.update', saveCreds)

    // 4. Request pairing code with 10s delay for Render
    if (!sock.authState.creds.registered && PHONE_NUMBER) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER)
                console.log(`\n🔥 ${BOT_NAME} Pairing Code: ${code.match(/.{1,3}/g).join('-')}\n`)
            } catch (error) {
                console.error("Pairing Code Error:", error)
                console.log("Retrying in 15 seconds...")
                setTimeout(() => connectToWhatsApp(), 15000) // auto retry
            }
        }, 10000) // 10 second delay for Render
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Connection closed. Reconnecting...', shouldReconnect)
            if(shouldReconnect) connectToWhatsApp()
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} connection successfully opened!`)
        }
    })
}

// Keep Render alive
app.get('/', (req, res) => res.send(`${BOT_NAME} Bot is Live`))
app.listen(PORT, () => console.log(`${BOT_NAME} running on port ${PORT}`))

connectToWhatsApp()

// Ping every 30s so Render doesn't sleep during pairing
setInterval(() => console.log(`${BOT_NAME} is alive`), 30000)
