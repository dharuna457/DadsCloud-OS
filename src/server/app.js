// Curl-only compatible server: no bcrypt, no systeminformation, no multer.
// Uses built-in 'os' for CPU/memory, shapes responses to match your index.html.

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const WebSocket = require('ws');

const app = express();
app.use(helmet());
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = parseInt(process.env.PORT || '1468', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '1469', 10);

// ---- Auth (plain). Supports optional config/users.json with plaintext passwords ----
const USERS_FILE = path.join(__dirname, '..', '..', '..', 'config', 'users.json');
let users = [{ username: 'admin', password: 'admin123', role: 'admin' }];
try {
  if (fs.existsSync(USERS_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    if (Array.isArray(parsed) && parsed.length) users = parsed;
  }
} catch (e) {
  console.warn('users.json read failed; using default user.', e.message);
}

const sessions = new Map();

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = Math.random().toString(36).slice(2);
  sessions.set(token, { username: user.username, ts: Date.now() });
  res.json({ success: true, token }); // your HTML expects "success"
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// ---- Stats helpers (match your index.html expectations) ----
function buildStatsSnapshot() {
  const loads = os.loadavg();
  const cpuCount = Math.max((os.cpus() || []).length, 1);
  let cpuPct = 0;
  if (loads && loads.length) cpuPct = Math.min(100, Math.max(0, (loads[0] / cpuCount) * 100));

  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const memPct = total ? (used / total) * 100 : 0;

  return {
    cpu: Math.round(cpuPct),
    memory: { used: (used / 1e9).toFixed(2), percentage: Math.round(memPct) },
    disk: { used: (0).toFixed(2), percentage: 0 } // placeholder without extra deps
  };
}
function formatUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

app.get('/api/status', (req, res) => {
  const stats = buildStatsSnapshot();
  res.json({ stats, uptime: formatUptime(os.uptime()), apps: { running: 0 } });
});

// ---- App APIs (pretty demo so your grid looks alive) ----
app.get('/api/apps/catalog', (req, res) => {
  res.json({
    jellyfin: { id: 'jellyfin', name: 'Media Server', description: 'Stream movies, shows, and music.', icon: 'fas fa-film', color: 'from-indigo-500 to-blue-500' },
    nextcloud: { id: 'nextcloud', name: 'Cloud Storage', description: 'Your personal file cloud.', icon: 'fas fa-cloud', color: 'from-sky-500 to-cyan-500' },
    homeassistant: { id: 'homeassistant', name: 'Smart Home', description: 'Automate and control your devices.', icon: 'fas fa-house-signal', color: 'from-emerald-500 to-teal-500' }
  });
});
app.get('/api/apps/installed', (req, res) => {
  res.json([
    { id: 'nextcloud', name: 'Nextcloud', description: 'Private cloud drive', status: 'running', icon: 'fas fa-cloud', color: 'from-sky-500 to-cyan-500' },
    { id: 'jellyfin', name: 'Jellyfin', description: 'Media streaming server', status: 'stopped', icon: 'fas fa-film', color: 'from-indigo-500 to-blue-500' }
  ]);
});
app.post('/api/apps/install', (req, res) => res.json({ message: 'Install stub (no-op in curl-only mode)' }));

// ---- Static UI ----
app.use(express.static(path.join(__dirname, '..', '..', '..', 'web')));

app.listen(PORT, () => console.log(`HTTP server running on http://localhost:${PORT}`));

// ---- WebSocket: { type: 'stats', data: <same as /api/status.stats> } ----
const wsServer = new WebSocket.Server({ port: WS_PORT });
wsServer.on('connection', (ws) => {
  const send = () => ws.send(JSON.stringify({ type: 'stats', data: buildStatsSnapshot() }));
  const id = setInterval(send, 3000);
  send();
  ws.on('close', () => clearInterval(id));
});

