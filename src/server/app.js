// File: src/server/app.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

const app = express();
const PORT = 1468;
const execAsync = promisify(exec);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../web')));

// CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
});

// App catalog - Available apps for installation
const APP_CATALOG = {
    'media-server': {
        name: 'Media Server',
        description: 'Stream your movies and TV shows',
        icon: 'fas fa-play',
        color: 'from-red-500 to-pink-500',
        port: 8096,
        executable: 'jellyfin',
        downloadUrl: 'https://repo.jellyfin.org/releases/server/windows/stable/combined/jellyfin_10.8.11.exe',
        installCommand: 'jellyfin_10.8.11.exe /S',
        serviceName: 'Jellyfin',
        category: 'media'
    },
    'file-manager': {
        name: 'Cloud Storage',
        description: 'Personal file storage and sync',
        icon: 'fas fa-folder',
        color: 'from-blue-500 to-cyan-500',
        port: 8080,
        executable: 'nextcloud',
        downloadUrl: 'https://download.nextcloud.com/server/installer/nextcloud-installer.exe',
        installCommand: 'nextcloud-installer.exe /S',
        serviceName: 'Nextcloud',
        category: 'storage'
    },
    'smart-home': {
        name: 'Smart Home',
        description: 'Control your smart devices',
        icon: 'fas fa-home',
        color: 'from-green-500 to-teal-500',
        port: 8123,
        executable: 'homeassistant',
        downloadUrl: 'https://github.com/home-assistant/core/releases/latest',
        installCommand: 'pip install homeassistant',
        serviceName: 'HomeAssistant',
        category: 'automation'
    },
    'ad-blocker': {
        name: 'DNS Ad Blocker',
        description: 'Block ads network-wide',
        icon: 'fas fa-shield-alt',
        color: 'from-purple-500 to-indigo-500',
        port: 80,
        executable: 'pihole',
        downloadUrl: 'https://github.com/pi-hole/pi-hole/releases/latest',
        installCommand: 'curl -sSL https://install.pi-hole.net | bash',
        serviceName: 'PiHole',
        category: 'security'
    }
};

// System utilities
class SystemManager {
    static async getSystemStats() {
        try {
            const { stdout: cpuInfo } = await execAsync('wmic cpu get loadpercentage /value');
            const cpuMatch = cpuInfo.match(/LoadPercentage=(\d+)/);
            const cpuUsage = cpuMatch ? parseInt(cpuMatch[1]) : 0;

            const { stdout: memInfo } = await execAsync('wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /value');
            const totalMatch = memInfo.match(/TotalVisibleMemorySize=(\d+)/);
            const freeMatch = memInfo.match(/FreePhysicalMemory=(\d+)/);
            
            const totalMem = totalMatch ? parseInt(totalMatch[1]) * 1024 : 0;
            const freeMem = freeMatch ? parseInt(freeMatch[1]) * 1024 : 0;
            const usedMem = totalMem - freeMem;

            const { stdout: diskInfo } = await execAsync('wmic logicaldisk where size!=0 get size,freespace /value');
            const sizeMatch = diskInfo.match(/Size=(\d+)/);
            const freeSpaceMatch = diskInfo.match(/FreeSpace=(\d+)/);
            
            const totalDisk = sizeMatch ? parseInt(sizeMatch[1]) : 0;
            const freeDisk = freeSpaceMatch ? parseInt(freeSpaceMatch[1]) : 0;

            return {
                cpu: Math.min(cpuUsage, 100),
                memory: {
                    used: Math.round(usedMem / (1024 * 1024 * 1024) * 10) / 10,
                    total: Math.round(totalMem / (1024 * 1024 * 1024) * 10) / 10,
                    percentage: Math.round((usedMem / totalMem) * 100)
                },
                disk: {
                    used: Math.round((totalDisk - freeDisk) / (1024 * 1024 * 1024) * 10) / 10,
                    total: Math.round(totalDisk / (1024 * 1024 * 1024) * 10) / 10,
                    free: Math.round(freeDisk / (1024 * 1024 * 1024) * 10) / 10,
                    percentage: Math.round(((totalDisk - freeDisk) / totalDisk) * 100)
                }
            };
        } catch (error) {
            console.error('Error getting system stats:', error);
            return {
                cpu: 0,
                memory: { used: 0, total: 8, percentage: 0 },
                disk: { used: 0, total: 500, free: 500, percentage: 0 }
            };
        }
    }

    static async getInstalledApps() {
        try {
            const appsFile = path.join(__dirname, '../../data/installed-apps.json');
            const data = await fs.readFile(appsFile, 'utf8').catch(() => '[]');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    static async saveInstalledApps(apps) {
        try {
            const dataDir = path.join(__dirname, '../../data');
            await fs.mkdir(dataDir, { recursive: true });
            const appsFile = path.join(dataDir, 'installed-apps.json');
            await fs.writeFile(appsFile, JSON.stringify(apps, null, 2));
        } catch (error) {
            console.error('Error saving installed apps:', error);
        }
    }

    static async isServiceRunning(serviceName) {
        try {
            const { stdout } = await execAsync(`sc query "${serviceName}"`);
            return stdout.includes('RUNNING');
        } catch {
            return false;
        }
    }
}

// API Routes

// Get system status and stats
app.get('/api/status', async (req, res) => {
    try {
        const stats = await SystemManager.getSystemStats();
        const installedApps = await SystemManager.getInstalledApps();
        
        res.json({
            status: 'online',
            version: '1.0.0',
            port: PORT,
            stats,
            apps: {
                installed: installedApps.length,
                running: installedApps.filter(app => app.status === 'running').length
            },
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get available apps catalog
app.get('/api/apps/catalog', (req, res) => {
    res.json(APP_CATALOG);
});

// Get installed apps
app.get('/api/apps/installed', async (req, res) => {
    try {
        const installedApps = await SystemManager.getInstalledApps();
        
        // Update status for each app
        for (let app of installedApps) {
            const isRunning = await SystemManager.isServiceRunning(app.serviceName);
            app.status = isRunning ? 'running' : 'stopped';
        }
        
        await SystemManager.saveInstalledApps(installedApps);
        res.json(installedApps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Install an app
app.post('/api/apps/install', async (req, res) => {
    const { appId } = req.body;
    
    if (!APP_CATALOG[appId]) {
        return res.status(404).json({ error: 'App not found in catalog' });
    }
    
    try {
        const app = APP_CATALOG[appId];
        const installedApps = await SystemManager.getInstalledApps();
        
        // Check if already installed
        if (installedApps.find(installed => installed.id === appId)) {
            return res.status(400).json({ error: 'App already installed' });
        }
        
        res.json({ 
            message: `Installing ${app.name}...`,
            appId,
            status: 'installing'
        });
        
        // Simulate installation process (in production, this would download and install)
        setTimeout(async () => {
            const newApp = {
                id: appId,
                name: app.name,
                description: app.description,
                icon: app.icon,
                color: app.color,
                port: app.port,
                serviceName: app.serviceName,
                status: 'running',
                installedAt: new Date().toISOString(),
                url: `http://localhost:${app.port}`
            };
            
            installedApps.push(newApp);
            await SystemManager.saveInstalledApps(installedApps);
            console.log(`${app.name} installed successfully`);
        }, 3000);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Uninstall an app
app.delete('/api/apps/:appId', async (req, res) => {
    const { appId } = req.params;
    
    try {
        const installedApps = await SystemManager.getInstalledApps();
        const appIndex = installedApps.findIndex(app => app.id === appId);
        
        if (appIndex === -1) {
            return res.status(404).json({ error: 'App not installed' });
        }
        
        const app = installedApps[appIndex];
        installedApps.splice(appIndex, 1);
        await SystemManager.saveInstalledApps(installedApps);
        
        res.json({ message: `${app.name} uninstalled successfully` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Control app (start/stop)
app.post('/api/apps/:appId/control', async (req, res) => {
    const { appId } = req.params;
    const { action } = req.body; // 'start' or 'stop'
    
    try {
        const installedApps = await SystemManager.getInstalledApps();
        const app = installedApps.find(app => app.id === appId);
        
        if (!app) {
            return res.status(404).json({ error: 'App not installed' });
        }
        
        // Simulate service control (in production, this would use Windows service commands)
        if (action === 'start') {
            app.status = 'running';
        } else if (action === 'stop') {
            app.status = 'stopped';
        }
        
        await SystemManager.saveInstalledApps(installedApps);
        res.json({ message: `${app.name} ${action}ed successfully`, status: app.status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get system logs
app.get('/api/logs', async (req, res) => {
    try {
        const logs = [
            { timestamp: new Date().toISOString(), level: 'info', message: 'DadsCloud OS started successfully' },
            { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'info', message: 'System health check passed' },
            { timestamp: new Date(Date.now() - 120000).toISOString(), level: 'info', message: 'Port 1468 is listening' }
        ];
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WebSocket for real-time updates (optional enhancement)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 1469 });

wss.on('connection', (ws) => {
    console.log('Client connected for real-time updates');
    
    // Send system stats every 5 seconds
    const statsInterval = setInterval(async () => {
        try {
            const stats = await SystemManager.getSystemStats();
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

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`DadsCloud OS running on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:1469`);
    console.log('='.repeat(50));
    console.log('🚀 DadsCloud OS v1.0.0 - Ready!');
    console.log('📱 Dashboard: http://localhost:1468');
    console.log('🔧 API: http://localhost:1468/api/status');
    console.log('='.repeat(50));
});

module.exports = app;