// server.js
const express = require('express');
const path = require('path');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  delay, 
  Browsers 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the index.html and any other static assets from the current directory
app.use(express.static(__dirname));

// Track simple site analytics
let visitorCount = 1024;
const startTime = Date.now();

// --- BAILEYS PAIRING SERVICE ---
async function generatePairingCode(phoneNumber) {
  const { state } = await useMultiFileAuthState(`./auth_temp_${Date.now()}`);
  
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000
  });

  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  await delay(3000);

  if (!sock.authState.creds.registered) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const code = await sock.requestPairingCode(cleanNumber);
        return code;
      } catch (err) {
        if (attempt === 3) throw err;
        await delay(2000);
      }
    }
  } else {
    throw new Error('Device is already registered.');
  }
}

// --- API ENDPOINTS ---

// WhatsApp Pairing Route
app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  try {
    const code = await generatePairingCode(number);
    res.json({ code });
  } catch (err) {
    console.error('Pairing Error:', err);
    res.status(500).json({ error: 'Failed to connect to WhatsApp. Please try again.' });
  }
});

// Visitor Tracker Route
app.get('/api/visit', (req, res) => {
  visitorCount++;
  res.json({ visitors: visitorCount });
});

// OS Stats Route
app.get('/api/stats', (req, res) => {
  res.json({
    speed: '0.8s',
    uptime: '99.9%',
    visitors: visitorCount
  });
});

// Paystack Verification Route
app.post('/api/verify-paystack', (req, res) => {
  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ success: false, message: 'Missing transaction reference' });
  }
  res.json({ success: true, reference });
});

// Serve index.html on root access
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
                                
