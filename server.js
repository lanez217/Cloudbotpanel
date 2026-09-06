// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  delay, 
  Browsers,
  DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// Set static FFmpeg path for serverless/cloud hosting without terminal access
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

let visitorCount = 1024;

// --- BAILEYS SESSIONS MANAGER ---
// Stores active sockets so connection stays alive while user types the code in WhatsApp
const activeSessions = new Map();

async function getOrInitSocket(phoneNumber) {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  const authDir = path.join(__dirname, 'sessions', `session_${cleanNumber}`);

  if (activeSessions.has(cleanNumber)) {
    return { sock: activeSessions.get(cleanNumber), cleanNumber };
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      activeSessions.delete(cleanNumber);
      if (shouldReconnect) {
        // Re-initialize if disconnected unexpectedly
        getOrInitSocket(cleanNumber);
      }
    } else if (connection === 'open') {
      console.log(`WhatsApp paired successfully for: ${cleanNumber}`);
    }
  });

  activeSessions.set(cleanNumber, sock);
  return { sock, cleanNumber };
}

// Helper to download remote file locally for FFmpeg processing
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// --- VIDEO PROCESSING ENDPOINT (WATERMARK & BLUR) ---
app.post('/api/process-video', async (req, res) => {
  const { videoUrl, mode } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'Video URL required.' });

  if (mode === 'clean') {
    return res.json({ processedUrl: videoUrl });
  }

  const inputPath = path.join(__dirname, `temp_in_${Date.now()}.mp4`);
  const outputPath = path.join(__dirname, `temp_out_${Date.now()}.mp4`);

  try {
    await downloadFile(videoUrl, inputPath);

    ffmpeg(inputPath)
      .videoFilters([
        'boxblur=10:10',
        "drawtext=text='LANEZ PURE OS':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6"
      ])
      .outputOptions('-preset ultrafast')
      .save(outputPath)
      .on('end', () => {
        res.sendFile(outputPath, () => {
          fs.unlink(inputPath, () => {});
          fs.unlink(outputPath, () => {});
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        fs.unlink(inputPath, () => {});
        fs.unlink(outputPath, () => {});
        res.status(500).json({ error: 'Failed to process video watermark.' });
      });
  } catch (err) {
    console.error('Processing error:', err);
    res.status(500).json({ error: 'Failed to download source video for processing.' });
  }
});

// --- WHATSAPP PAIRING API ---
app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number is required.' });

  try {
    const { sock, cleanNumber } = await getOrInitSocket(number);

    // Wait 3 seconds for WebSocket connection state to stabilize
    await delay(3000);

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(cleanNumber);
      return res.json({ code });
    } else {
      return res.status(400).json({ error: 'Device is already registered or paired.' });
    }
  } catch (err) {
    console.error('Pairing Endpoint Error:', err);
    res.status(500).json({ error: 'Failed to generate code. Ensure phone number is valid.' });
  }
});

// --- ANALYTICS & STATS ENDPOINTS ---
app.get('/api/visit', (req, res) => {
  visitorCount++;
  res.json({ visitors: visitorCount });
});

app.get('/api/stats', (req, res) => {
  res.json({ speed: '0.8s', uptime: '99.9%', visitors: visitorCount });
});

app.post('/api/verify-paystack', (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ success: false });
  res.json({ success: true, reference });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
           
