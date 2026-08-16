const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { startBot, requestPairingCodeExplicit } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
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
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
