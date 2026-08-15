require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { startBot, stopBot } = require('./bot.js');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from root directory
app.use(express.static(__dirname));
app.use(express.json());

let activeBots = new Map(); // userId: sock

// Serve index.html from root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
    res.json({
        botsOnline: activeBots.size,
        totalUsers: activeBots.size,
        uptime: process.uptime()
    });
});

io.on('connection', (socket) => {
    console.log('User connected to panel');

    socket.on('connect_bot', async ({ userId, phone }) => {
        if (activeBots.has(userId)) return socket.emit('status', 'Bot already running');

        socket.emit('status', 'Starting bot...');
        const sock = await startBot(userId, phone, io, socket);
        activeBots.set(userId, sock);
    });

    socket.on('disconnect_bot', ({ userId }) => {
        stopBot(userId);
        activeBots.delete(userId);
        socket.emit('disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Panel running on port ${PORT}`));
