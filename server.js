// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');
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
app.use(express.static(__dirname));

let visitorCount = 1024;

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

  // Clean mode returns original URL directly
  if (mode === 'clean') {
    return res.json({ processedUrl: videoUrl });
  }

  const inputPath = path.join(__dirname, `temp_in_${Date.now()}.mp4`);
  const outputPath = path.join(__dirname, `temp_out_${Date.now()}.mp4`);

  try {
    await downloadFile(videoUrl, inputPath);

    // Apply FFmpeg filters: Boxblur + Text Overlay
    ffmpeg(inputPath)
      .videoFilters([
        'boxblur=10:10', // Blurs the video frames
        "drawtext=text='LANEZ PURE OS':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6"
      ])
      .outputOptions('-preset ultrafast')
      .save(outputPath)
      .on('end', () => {
        res.sendFile(outputPath, () => {
          // Cleanup temporary files after sending
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
app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number is required.' });

  try {
    const code = await generatePairingCode(number);
    res.json({ code });
  } catch (err) {
    console.error('Pairing Error:', err);
    res.status(500).json({ error: 'Failed to connect to WhatsApp.' });
  }
});

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
         
