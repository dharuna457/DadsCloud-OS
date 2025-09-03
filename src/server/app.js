const express = require('express');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const app = express();
const PORT = 1468;
const execAsync = promisify(exec);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../web')));

// Real Windows system stats function
async function getRealSystemStats() {
    try {
        // Get CPU usage
        const { stdout: cpuData } = await execAsync('wmic cpu get loadpercentage /value');
        const cpuMatch = cpuData.match(/LoadPercentage=(\d+)/);
        const cpuUsage = cpuMatch ? parseInt(cpuMatch[1]) : 0;

        // Get memory info
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // Get disk info
        const { stdout: diskData } = await execAsync('wmic logicaldisk where "DeviceID=\'C:\'" get size,freespace /value');
        const sizeMatch = diskData.match(/Size=(\d+)/);
        const freeMatch = diskData.match(/FreeSpace=(\d+)/);
        
        const totalDisk = sizeMatch ? parseInt(sizeMatch[1]) : 0;
        const freeDisk = freeMatch ? parseInt(freeMatch[1]) : 0;
        const usedDisk = totalDisk - freeDisk;

        return {
            cpu: cpuUsage,
            memory: {
                used: Math.round(usedMem / (1024 * 1024 * 1024) * 10) / 10,
                total: Math.round(totalMem / (1024 * 1024 * 1024) * 10) / 10,
                percentage: Math.round((usedMem / totalMem) * 100)
            },
            disk: {
                used: Math.round(usedDisk / (1024 * 1024 * 1024) * 10) / 10,
                total: Math.round(totalDisk / (1024 * 1024 * 1024) * 10) / 10,
                percentage: Math.round((usedDisk / totalDisk) * 100)
            }
        };
    } catch (error) {
        console.error('Error getting system stats:', error);
        return {
            cpu: 0,
            memory: { used: 0, total: 8, percentage: 0 },
            disk: { used: 0, total: 500, percentage: 0 }
        };
    }
}

// API endpoint for system status
app.get('/api/status', async (req, res) => {
    const stats = await getRealSystemStats();
    res.json({
        status: 'online',
        version: '1.0.0',
        port: PORT,
        stats,
        apps: {
            installed: 1,
            running: 1
        }
    });
});

app.listen(PORT, () => {
    console.log(`DadsCloud OS running on http://localhost:${PORT}`);
});
