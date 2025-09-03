require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const si = require('systeminformation');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==== Configurable ports ====
const PORT = parseInt(process.env.PORT || '1468', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '1469', 10);

// ==== Users from config/users.json (bcrypt-hashed) ====
const USERS_FILE = path.join(__dirname, '..', '..', '..', 'config', 'users.json');
let users = [];
try {
  users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
} catch {
  users = [];
}
if (users.length === 0) {
  const defaultHash = bcrypt.hashSync('admin123', 10);
  users = [{ username: 'admin', passwordHash: defaultHash, role: 'admin' }];
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  console.warn('⚠️ Created default user admin/admin123 — change this password ASAP!');
}

// ==== Auth/session ====
const sessions = new Map();

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  let user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = user.passwordHash
    ? bcrypt.compareSync(password, user.passwordHash)
    : user.password === password;

  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = Math.random().toString(36).slice(2);
  sessions.set(token, { username, ts: Date.now() });
  res.json({ token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// ==== System status (cross-platform via systeminformation) ====
app.get('/api/status', async (req, res) => {
  try {
    const [load, mem, fsSizes] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize()
    ]);
    const totalDisk = fsSizes.reduce((a, d) => a + (d.size || 0), 0);
    const usedDisk = fsSizes.reduce((a, d) => a + (d.used || 0), 0);
    res.json({
      cpu: { load: load.currentload },
      memory: { total: mem.total, used: mem.total - mem.available, free: mem.available },
      disk: { total: totalDisk, used: usedDisk }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get system info' });
  }
});

// ==== File upload ====
const uploadDir = path.join(__dirname, '..', '..', '..', 'data', 'files');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_BYTES || '104857600', 10) }
});
app.post('/api/files/upload', upload.array('files'), (req, res) => {
  res.json({ uploaded: (req.files || []).map(f => f.filename) });
});

// ==== Apps (stubbed) ====
app.get('/api/apps/catalog', (req, res) => {
  res.json([
    { id: 'media',     name: 'Media Server',  port: 8096 },
    { id: 'storage',   name: 'Cloud Storage', port: 8080 },
    { id: 'smarthome', name: 'Smart Home',    port: 8123 }
  ]);
});
app.get('/api/apps/installed', (req, res) => {
  res.json([]); // TODO: load from data/installed-apps.json
});
app.post('/api/apps/install', (req, res) => {
  res.json({ message: 'Install stub (no-op)' });
});

// ==== Static UI ====
app.use(express.static(path.join(__dirname, '..', '..', '..', 'web')));

// ==== HTTP server ====
app.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
});

// ==== WebSocket server ====
const wsServer = new WebSocket.Server({ port: WS_PORT });
wsServer.on('connection', (ws) => {
  const sendStats = async () => {
    try {
      const [load, mem, fsSizes] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize()
      ]);
      const totalDisk = fsSizes.reduce((a, d) => a + (d.size || 0), 0);
      const usedDisk = fsSizes.reduce((a, d) => a + (d.used || 0), 0);
      ws.send(JSON.stringify({
        cpu: { load: load.currentload },
        memory: { total: mem.total, used: mem.total - mem.available },
        disk: { total: totalDisk, used: usedDisk }
      }));
    } catch (e) {
      console.error('WS error', e);
    }
  };
  const id = setInterval(sendStats, 3000);
  ws.on('close', () => clearInterval(id));
});

