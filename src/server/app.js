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

// Ports (env-capable, defaults preserved)
const PORT = parseInt(process.env.PORT || '1468', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '1469', 10);

// ---- Auth (plain, curl-friendly). Optional config/users.json with plaintext passwords ----
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
  // Your frontend checks result.success; keep that field
  res.json({ success: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// ---- Helpers to shape stats exactly as your HTML expects ----
function buildStatsSnapshot() {
  // CPU: rough estimate using loadavg (on Windows this is often 0)
  const loads = os.loadavg();
  const cpuCount = Math.max((os.cpus() || []).length, 1);
  let cpuPct = 0;
  if (loads && loads.length) {
    cpuPct = Math.min(100, Math.max(0, (loads[0] / cpuCount) * 100));
  }

  // Memory
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const memPct = total ? (used / total) * 100 : 0;

  // Disk: we don’t have a cross-platform disk lib without extra deps.
  // Keep zeros so UI still renders nicely; you can wire a real value later.
  const diskUsedGB = 0;
  const diskPct = 0;

  return {
    cpu: Math.round(cpuPct), // your HTML expects a plain number (e.g., 37)
    memory: {
      used: (used / 1e9).toFixed(2),          // "x.xx" GB string (your UI concatenates "GB")
      percentage: Math.round(memPct)          // number for the bar width
    },
    disk: {
      used: diskUsedGB.toFixed(2),            // "x.xx" GB string
      percentage: Math.round(diskPct)         // number
    }
  };
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ---- /api/status: shape matches your big HTML ----
app.get('/api/status', (req, res) => {
  const stats = buildStatsSnapshot();
  res.json({
    stats,                                   // <— your HTML reads status.stats
    uptime: formatUptime(os.uptime()),       // <— your HTML shows uptime string
    apps: { running: 0 }                     // <— your HTML reads status.apps.running
  });
});

// ---- Apps endpoints: return richer objects your UI renders (icon/color/status) ----
app.get('/api/apps/catalog', (req, res) => {
  res.json({
    jellyfin: {
      id: 'jellyfin',
      name: 'Media Server',
      description: 'Stream movies, shows, and music.',
      icon: 'fas fa-film',
      color: 'from-indigo-500 to-blue-500'
    },
    nextcloud: {
      id: 'nextcloud',
      name: 'Cloud Storage',
      description: 'Your personal file cloud.',
      icon: 'fas fa-cloud',
      color: 'from-sky-500 to-cyan-500'
    },
    homeassistant: {
      id: 'homeassistant',
      name: 'Smart Home',
      description: 'Automate and control your devices.',
      icon: 'fas fa-house-signal',
      color: 'from-emerald-500 to-teal-500'
    }
  });
});

app.get('/api/apps/installed', (req, res) => {
  // Prettier demo list so the grid looks alive
  res.json([
    {
      id: 'nextcloud',
      name: 'Nextcloud',
      description: 'Private cloud drive',
      status: 'running',
      icon: 'fas fa-cloud',
      color: 'from-sky-500 to-cyan-500'
    },
    {
      id: 'jellyfin',
      name: 'Jellyfin',
      description: 'Media streaming server',
      status: 'stopped',
      icon: 'fas fa-film',
      color: 'from-indigo-500 to-blue-500'
    }
  ]);
});

app.post('/api/apps/install', (req, res) => {
  res.json({ message: 'Install stub (no-op in curl-only mode)' });
});

// ---- Static UI ----
app.use(express.static(path.join(__dirname, '..', '..', '..', 'web')));

// ---- HTTP server ----
app.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
});

// ---- WebSocket server: sends { type: 'stats', data: <same shape as /api/status.stats> } ----
const wsServer = new WebSocket.Server({ port: WS_PORT });
wsServer.on('connection', (ws) => {
  const tick = () => {
    try {
      const stats = buildStatsSnapshot();
      ws.send(JSON.stringify({ type: 'stats', data: stats }));
    } catch (e) {
      console.error('WS send error:', e.message);
    }
  };
  const id = setInterval(tick, 3000);
  tick(); // send immediately
  ws.on('close', () => clearInterval(id));
});

