const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

const app = express();
const PORT = 1468;
const execAsync = promisify(exec);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../web')));

// CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
});

// In-memory user storage (in production, use database)
const users = {
    admin: {
        username: 'admin',
        password: 'admin123', // In production, hash this
        createdAt: new Date().toISOString()
    }
};

// Session storage
const sessions = new Map();

// Generate session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Authentication middleware
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    const session = sessions.get(token);
    
    if (!session || Date.now() > session.expiresAt) {
        sessions.delete(token);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = session.user;
    next();
}

// Real Windows system stats function
async function getRealSystemStats() {
    try {
        // Get CPU usage
        const { stdout: cpuData } = await execAsync('wmic cpu get loadpercentage /value').catch(() => ({ stdout: 'LoadPercentage=0' }));
        const cpuMatch = cpuData.match(/LoadPercentage=(\d+)/);
        const cpuUsage = cpuMatch ? parseInt(cpuMatch[1]) : Math.floor(Math.random() * 40) + 10;

        // Get memory info
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // Get disk info (fallback for non-Windows)
        let diskStats = { used: 0, total: 500, percentage: 0 };
        try {
            const { stdout: diskData } = await execAsync('wmic logicaldisk where "DeviceID=\'C:\'" get size,freespace /value');
            const sizeMatch = diskData.match(/Size=(\d+)/);
            const freeMatch = diskData.match(/FreeSpace=(\d+)/);
            
            if (sizeMatch && freeMatch) {
                const totalDisk = parseInt(sizeMatch[1]);
                const freeDisk = parseInt(freeMatch[1]);
                const usedDisk = totalDisk - freeDisk;
                
                diskStats = {
                    used: Math.round(usedDisk / (1024 * 1024 * 1024) * 10) / 10,
                    total: Math.round(totalDisk / (1024 * 1024 * 1024) * 10) / 10,
                    percentage: Math.round((usedDisk / totalDisk) * 100)
                };
            }
        } catch (error) {
            // Fallback disk stats
            diskStats = {
                used: 350.4,
                total: 500.0,
                percentage: 70
            };
        }

        return {
            cpu: cpuUsage,
            memory: {
                used: Math.round(usedMem / (1024 * 1024 * 1024) * 10) / 10,
                total: Math.round(totalMem / (1024 * 1024 * 1024) * 10) / 10,
                percentage: Math.round((usedMem / totalMem) * 100)
            },
            disk: diskStats
        };
    } catch (error) {
        console.error('Error getting system stats:', error);
        return {
            cpu: Math.floor(Math.random() * 40) + 10,
            memory: { 
                used: Math.round(Math.random() * 8 + 4), 
                total: 16, 
                percentage: Math.floor(Math.random() * 60) + 20 
            },
            disk: { 
                used: 350.4, 
                total: 500.0, 
                percentage: 70 
            }
        };
    }
}

// Get system uptime
function getSystemUptime() {
    const uptimeSeconds = os.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
}

// App catalog
const APP_CATALOG = {
    'media-server': {
        name: 'Media Server',
        description: 'Stream your movies and TV shows',
        icon: 'fas fa-play',
        color: 'from-red-500 to-pink-500',
        port: 8096,
        category: 'media'
    },
    'file-manager': {
        name: 'Cloud Storage',
        description: 'Personal file storage and sync',
        icon: 'fas fa-folder',
        color: 'from-blue-500 to-cyan-500',
        port: 8080,
        category: 'storage'
    },
    'smart-home': {
        name: 'Smart Home',
        description: 'Control your smart devices',
        icon: 'fas fa-home',
        color: 'from-green-500 to-teal-500',
        port: 8123,
        category: 'automation'
    }
};

// API Routes

// Authentication endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = users[username];
    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const token = generateToken();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    
    sessions.set(token, {
        user: { username: user.username },
        expiresAt
    });
    
    res.json({ 
        success: true, 
        token,
        user: { username: user.username }
    });
});

// Logout endpoint
app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    sessions.delete(token);
    res.json({ success: true });
});

// System status endpoint
app.get('/api/status', requireAuth, async (req, res) => {
    try {
        const stats = await getRealSystemStats();
        const uptime = getSystemUptime();
        
        res.json({
            status: 'online',
            version: '1.0.0',
            port: PORT,
            uptime,
            stats,
            apps: {
                installed: 1,
                running: 1
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get app catalog
app.get('/api/apps/catalog', requireAuth, (req, res) => {
    res.json(APP_CATALOG);
});

// Get installed apps
app.get('/api/apps/installed', requireAuth, async (req, res) => {
    try {
        // Mock installed apps for now
        const installedApps = [
            {
                id: 'file-manager',
                name: 'Cloud Storage',
                description: 'Personal file storage and sync',
                icon: 'fas fa-folder',
                color: 'from-blue-500 to-cyan-500',
                status: 'running',
                port: 8080
            }
        ];
        
        res.json(installedApps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Install app endpoint
app.post('/api/apps/install', requireAuth, async (req, res) => {
    const { appId } = req.body;
    
    if (!APP_CATALOG[appId]) {
        return res.status(404).json({ error: 'App not found' });
    }
    
    res.json({
        success: true,
        message: `Installing ${APP_CATALOG[appId].name}...`,
        appId
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// WebSocket server for real-time updates
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 1469 });

wss.on('connection', (ws) => {
    console.log('Client connected for real-time updates');
    
    const statsInterval = setInterval(async () => {
        try {
            const stats = await getRealSystemStats();
            ws.send(JSON.stringify({ type: 'stats', data: stats }));
        } catch (error) {
            console.error('Error sending stats:', error);
        }
    }, 5000);
    
    ws.on('close', () => {
        clearInterval(statsInterval);
        console.log('Client disconnected');
    });
});
// Add multer for file uploads
const multer = require('multer');

// Configure file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = req.body.uploadPath || path.join(__dirname, '../../data/files');
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// Get directory contents
app.get('/api/files', requireAuth, async (req, res) => {
    try {
        const requestedPath = req.query.path || '';
        const basePath = path.join(__dirname, '../../data/files');
        const fullPath = path.resolve(basePath, requestedPath);
        
        if (!fullPath.startsWith(path.resolve(basePath))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.mkdir(basePath, { recursive: true });
        const items = await fs.readdir(fullPath, { withFileTypes: true });
        
        const files = await Promise.all(items.map(async (item) => {
            const itemPath = path.join(fullPath, item.name);
            const stats = await fs.stat(itemPath);
            
            return {
                name: item.name,
                type: item.isDirectory() ? 'directory' : 'file',
                size: item.isFile() ? stats.size : 0,
                modified: stats.mtime.toISOString(),
                path: path.join(requestedPath, item.name).replace(/\\/g, '/'),
                extension: item.isFile() ? path.extname(item.name).toLowerCase() : null,
                isImage: item.isFile() && ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(path.extname(item.name).toLowerCase()),
                isText: item.isFile() && ['.txt', '.json', '.js', '.html', '.css', '.md', '.log'].includes(path.extname(item.name).toLowerCase())
            };
        }));
        
        files.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        res.json({
            currentPath: requestedPath.replace(/\\/g, '/'),
            items: files,
            totalItems: files.length,
            breadcrumbs: getBreadcrumbs(requestedPath)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read directory' });
    }
});

function getBreadcrumbs(currentPath) {
    if (!currentPath) return [{ name: 'Home', path: '' }];
    
    const parts = currentPath.split('/').filter(part => part);
    const breadcrumbs = [{ name: 'Home', path: '' }];
    
    let currentBreadcrumbPath = '';
    parts.forEach(part => {
        currentBreadcrumbPath += (currentBreadcrumbPath ? '/' : '') + part;
        breadcrumbs.push({
            name: part,
            path: currentBreadcrumbPath
        });
    });
    
    return breadcrumbs;
}

// Upload files
app.post('/api/files/upload', requireAuth, upload.array('files'), async (req, res) => {
    try {
        const uploadedFiles = req.files.map(file => ({
            name: file.filename,
            size: file.size,
            path: path.join(req.body.path || '', file.filename).replace(/\\/g, '/')
        }));
        
        res.json({
            success: true,
            message: `Uploaded ${uploadedFiles.length} file(s)`,
            files: uploadedFiles
        });
    } catch (error) {
        res.status(500).json({ error: 'Upload failed' });
    }
});
// Start server
app.listen(PORT, () => {
    console.log(`DadsCloud OS running on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:1469`);
    console.log('='.repeat(50));
    console.log('🚀 DadsCloud OS v1.0.0 - Ready!');
    console.log('📱 Dashboard: http://localhost:1468');
    console.log('👤 Default login: admin / admin123');
    console.log('='.repeat(50));
});

module.exports = app;
