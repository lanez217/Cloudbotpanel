const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { startBot } = require('./bot');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let activePairingCode = null;

// Persistent Visitor Count
const VISITORS_FILE = path.join(__dirname, 'visitors.json');

function getVisitorCount() {
    try {
        if (fs.existsSync(VISITORS_FILE)) {
            const data = fs.readFileSync(VISITORS_FILE, 'utf8');
            return JSON.parse(data).count || 0;
        }
    } catch (e) {
        console.error('Error reading visitor count:', e.message);
    }
    return 0;
}

function saveVisitorCount(count) {
    try {
        fs.writeFileSync(VISITORS_FILE, JSON.stringify({ count }), 'utf8');
    } catch (e) {
        console.error('Error saving visitor count:', e.message);
    }
}

let totalVisitors = getVisitorCount();

// Record Page Visit (Triggers ONCE on frontend load)
app.get('/api/visit', (req, res) => {
    totalVisitors++;
    saveVisitorCount(totalVisitors);
    res.json({ visitors: totalVisitors });
});

// Stats API
app.get('/api/stats', (req, res) => {
    const totalSeconds = Math.floor(process.uptime());
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const uptimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    res.json({
        servers: '1 Live',
        uptime: uptimeStr,
        speed: (Math.random() * 0.4 + 0.5).toFixed(2) + 's',
        visitors: totalVisitors
    });
});

// Paystack Verification Endpoint (Secures paid downloads)
app.post('/api/verify-paystack', async (req, res) => {
    const { reference } = req.body;
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_YOUR_SECRET_KEY_HERE";

    if (!reference) return res.status(400).json({ success: false, message: 'Reference missing' });

    try {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
        });

        if (response.data.data.status === 'success') {
            return res.json({ success: true, credits: 10 });
        } else {
            return res.status(400).json({ success: false, message: 'Transaction unverified' });
        }
    } catch (err) {
        console.error('Paystack verification error:', err.message);
        return res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

// WhatsApp Bot Pairing Endpoint
app.post('/pair', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone number is required.' });

    console.log(`📱 Pairing request received for: ${number}`);

    const sessionPath = path.join(__dirname, 'auth_info_lanez');
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log('🧹 Session cleared for new pair connection.');
        } catch (err) {
            console.error('Session clearance error:', err.message);
        }
    }

    activePairingCode = null;

    startBot(number, (code) => {
        activePairingCode = code;
    });

    let attempts = 0;
    while (!activePairingCode && attempts < 20) {
        await new Promise((r) => setTimeout(r, 500));
        attempts++;
    }

    if (activePairingCode) {
        return res.json({ code: activePairingCode });
    } else {
        return res.status(500).json({ error: 'Pairing timed out. Please try again.' });
    }
});

startBot();

// Keep-Alive Ping
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(async () => {
        try { await axios.get(RENDER_URL); } catch (e) {}
    }, 4 * 60 * 1000);
}

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err.message));
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Lanez Pure OS running on port ${PORT}`));
    
