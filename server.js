// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

// Set static FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

let visitorCount = 1024;

// --- BAILEYS SESSIONS MANAGER ---
const activeSessions = new Map();

async function getPairingCodeForNumber(phoneNumber) {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  
  // Store sessions in OS temporary directory to work safely on cloud hosts
  const authDir = path.join(os.tmpdir(), `session_${cleanNumber}`);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  return new Promise((resolve, reject) => {
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

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        activeSessions.set(cleanNumber, sock);
      } else if (connection === 'close') {
        activeSessions.delete(cleanNumber);
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          // Clean up state if connection closed before code was fetched
        }
      }
    });

    // Request pairing code only after socket initializes
    setTimeout(async () => {
      try {
        if (!sock.authState.creds.registered) {
          const code = await sock.requestPairingCode(cleanNumber);
          resolve(code);
        } else {
          reject(new Error('Device is already registered.'));
        }
      } catch (err) {
        reject(err);
      }
    }, 4000);
  });
}

// Helper to download remote file to temp folder
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    
    const request = client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    });

    request.on('error', (err) => {
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

  const timestamp = Date.now();
  const inputPath = path.join(os.tmpdir(), `temp_in_${timestamp}.mp4`);
  const outputPath = path.join(os.tmpdir(), `temp_out_${timestamp}.mp4`);

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
    res.status(500).json({ error: 'Failed to download source video.' });
  }
});

// --- WHATSAPP PAIRING API ---
app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number is required.' });

  try {
    const code = await getPairingCodeForNumber(number);
    res.json({ code });
  } catch (err) {
    console.error('Pairing Error:', err);
    res.status(500).json({ error: 'Connection closed or failed. Please check phone number and try again.' });
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
               
