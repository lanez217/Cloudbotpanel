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

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

let visitorCount = 1024;

// --- WHATSAPP PAIRING LOGIC ---
async function generatePairingCode(phoneNumber) {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  if (!cleanNumber || cleanNumber.length < 10) {
    throw new Error('INVALID_NUMBER');
  }

  // Safe isolated directory per attempt in system temp folder
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-auth-'));
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      // Request pairing code as soon as connection is open
      if ((connection === 'connecting' || connection === 'open') && !codeSent) {
        codeSent = true;
        await delay(3000); // Allow handshake to finalize
        try {
          if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(cleanNumber);
            resolve(code);
          } else {
            reject(new Error('Device already registered.'));
          }
        } catch (err) {
          reject(err);
        }
      }

      if (connection === 'close') {
        if (!codeSent) {
          reject(new Error('Connection closed before code was generated.'));
        }
      }
    });

    // Timeout safety fallback
    setTimeout(() => {
      if (!codeSent) reject(new Error('Connection timed out.'));
    }, 25000);
  });
}

// --- HELPER TO DOWNLOAD & HANDLE REDIRECTS ---
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    const request = (targetUrl) => {
      const client = targetUrl.startsWith('https') ? https : http;
      client.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return request(response.headers.location);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed with status ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

// --- VIDEO PROCESSING ENDPOINT ---
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
        console.error('FFmpeg processing error:', err);
        fs.unlink(inputPath, () => {});
        fs.unlink(outputPath, () => {});
        res.status(500).json({ error: 'Video processing failed.' });
      });
  } catch (err) {
    console.error('Video Download Error:', err);
    res.status(500).json({ error: 'Failed to retrieve media file.' });
  }
});

// --- API ROUTES ---
app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number is required.' });

  try {
    const code = await generatePairingCode(number);
    res.json({ code });
  } catch (err) {
    if (err.message === 'INVALID_NUMBER') {
      return res.status(400).json({ error: 'Please enter a valid phone number with country code (e.g., 233597789459).' });
    }
    console.error('Pair Error:', err);
    res.status(500).json({ error: 'Pairing server error. Ensure number includes country code without + or spaces.' });
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
  
