require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { startBot, requestPairingCodeExplicit } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static assets from the root project folder
app.use(express.static(__dirname));
app.use(express.json());

// Explicitly send index.html when visiting the main URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('User connected to panel');

    socket.on('start_bot', async (data) => {
        const { userId, phone } = data;
        try {
            await startBot(userId, phone, io, socket);
            
            if (phone) {
                const code = await requestPairingCodeExplicit(userId, phone);
                socket.emit('pairing_code', code);
            }
        } catch (err) {
            console.error('Error in start_bot:', err);
            socket.emit('status', 'Failed to generate pairing code. Retrying...');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`⚡ CloudBot Panel running on port ${PORT}`));
