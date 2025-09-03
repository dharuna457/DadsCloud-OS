# DadsCloud OS - Windows Installer Script
# This script installs DadsCloud OS as a Windows service

param(
    [string]$InstallPath = "$env:ProgramFiles\DadsCloud",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-ColorText {
    param($Text, $Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

function Show-Banner {
    Write-Host ""
    Write-ColorText "╔═══════════════════════════════════════════════╗" $Cyan
    Write-ColorText "║              DadsCloud OS v1.0.0              ║" $Cyan
    Write-ColorText "║          Open Source Personal Cloud          ║" $Cyan
    Write-ColorText "║             Installing on Windows            ║" $Cyan
    Write-ColorText "╚═══════════════════════════════════════════════╝" $Cyan
    Write-Host ""
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-NodeJS {
    Write-ColorText "📦 Checking Node.js installation..." $Yellow
    
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-ColorText "✅ Node.js $nodeVersion found" $Green
            return
        }
    } catch {}
    
    Write-ColorText "📦 Installing Node.js..." $Yellow
    
    # Download and install Node.js LTS
    $nodeUrl = "https://nodejs.org/dist/v20.9.0/node-v20.9.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart" -Wait
    Remove-Item $nodeInstaller
    
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    
    Write-ColorText "✅ Node.js installed successfully" $Green
}

function Install-DadsCloud {
    Write-ColorText "🚀 Installing DadsCloud OS..." $Yellow
    
    # Create install directory
    if (!(Test-Path $InstallPath)) {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    }
    
    # Download DadsCloud OS files
    Write-ColorText "📥 Downloading DadsCloud OS files..." $Yellow
    
    $repoUrl = "https://github.com/yourusername/dadscloud-os/archive/main.zip"
    $zipFile = "$env:TEMP\dadscloud-os.zip"
    
    try {
        Invoke-WebRequest -Uri $repoUrl -OutFile $zipFile -UseBasicParsing
        
        # Extract files
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zipFile, "$env:TEMP\dadscloud-extract")
        
        # Copy files to install directory
        $extractedPath = Get-ChildItem "$env:TEMP\dadscloud-extract" | Select-Object -First 1
        Copy-Item -Path "$($extractedPath.FullName)\*" -Destination $InstallPath -Recurse -Force
        
        # Clean up
        Remove-Item $zipFile -Force
        Remove-Item "$env:TEMP\dadscloud-extract" -Recurse -Force
        
    } catch {
        Write-ColorText "❌ Failed to download DadsCloud OS files" $Red
        throw
    }
    
    # Install npm dependencies
    Write-ColorText "📦 Installing dependencies..." $Yellow
    Set-Location $InstallPath
    npm install --production --silent
    
    Write-ColorText "✅ DadsCloud OS files installed" $Green
}

function Install-WindowsService {
    Write-ColorText "⚙️ Installing Windows service..." $Yellow
    
    # Create service wrapper script
    $serviceScript = @"
const { spawn } = require('child_process');
const path = require('path');

const dadscloudPath = path.join(__dirname, 'web', 'Node.js');
const child = spawn('node', [dadscloudPath], {
    cwd: __dirname,
    stdio: 'inherit'
});

child.on('exit', (code) => {
    if (code !== 0) {
        setTimeout(() => {
            // Restart on crash
            require('child_process').spawn(process.argv[0], process.argv.slice(1), {
                cwd: process.cwd(),
                detached: true,
                stdio: 'inherit'
            });
        }, 5000);
    }
});
"@
    
    $serviceScript | Out-File -FilePath "$InstallPath\service.js" -Encoding UTF8
    
    # Install node-windows for service management
    Set-Location $InstallPath
    npm install node-windows --save --silent
    
    # Create service installer
    $serviceInstaller = @"
const Service = require('node-windows').Service;

const svc = new Service({
    name: 'DadsCloud OS',
    description: 'DadsCloud OS - Personal Cloud Operating System',
    script: require('path').join(__dirname, 'service.js'),
    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096'
    ]
});

svc.on('install', function() {
    console.log('DadsCloud OS service installed successfully');
    svc.start();
});

svc.on('start', function() {
    console.log('DadsCloud OS service started');
    console.log('Access your dashboard at: http://localhost:1468');
});

svc.install();
"@
    
    $serviceInstaller | Out-File -FilePath "$InstallPath\install-service.js" -Encoding UTF8
    
    # Run service installer
    node "$InstallPath\install-service.js"
    
    Write-ColorText "✅ Windows service installed" $Green
}

function Add-FirewallRule {
    Write-ColorText "🔥 Configuring Windows Firewall..." $Yellow
    
    try {
        New-NetFirewallRule -DisplayName "DadsCloud OS" -Direction Inbound -Protocol TCP -LocalPort 1468 -Action Allow -ErrorAction SilentlyContinue
        Write-ColorText "✅ Firewall rule added for port 1468" $Green
    } catch {
        Write-ColorText "⚠️ Could not add firewall rule (this is optional)" $Yellow
    }
}

function Create-DesktopShortcut {
    Write-ColorText "🔗 Creating desktop shortcut..." $Yellow
    
    $shortcut = "$env:USERPROFILE\Desktop\DadsCloud OS.lnk"
    $wshell = New-Object -ComObject WScript.Shell
    $link = $wshell.CreateShortcut($shortcut)
    $link.TargetPath = "http://localhost:1468"
    $link.Description = "DadsCloud OS Dashboard"
    $link.Save()
    
    Write-ColorText "✅ Desktop shortcut created" $Green
}

function Show-CompletionMessage {
    Write-Host ""
    Write-ColorText "🎉 DadsCloud OS installed successfully!" $Green
    Write-Host ""
    Write-ColorText "📱 Access your dashboard:" $Cyan
    Write-ColorText "   http://localhost:1468" $Yellow
    Write-Host ""
    Write-ColorText "🚀 Service Status:" $Cyan
    Write-ColorText "   - Installed as Windows service" $Green
    Write-ColorText "   - Starts automatically on boot" $Green
    Write-ColorText "   - Running on port 1468" $Green
    Write-Host ""
    Write-ColorText "📖 Documentation: https://github.com/yourusername/dadscloud-os" $Cyan
    Write-ColorText "🐛 Issues: https://github.com/yourusername/dadscloud-os/issues" $Cyan
    Write-Host ""
    Write-ColorText "Opening DadsCloud OS in your browser..." $Yellow
    Start-Sleep 2
    Start-Process "http://localhost:1468"
}

function Uninstall-DadsCloud {
    Write-ColorText "🗑️ Uninstalling DadsCloud OS..." $Yellow
    
    # Stop and remove service
    try {
        $service = Get-Service "DadsCloud OS" -ErrorAction SilentlyContinue
        if ($service) {
            Stop-Service "DadsCloud OS" -Force
            
            # Remove service using node-windows
            $uninstallScript = @"
const Service = require('node-windows').Service;
const svc = new Service({
    name: 'DadsCloud OS',
    script: require('path').join(__dirname, 'service.js')
});
svc.on('uninstall', function() {
    console.log('DadsCloud OS service removed');
});
svc.uninstall();
"@
            $uninstallScript | Out-File -FilePath "$InstallPath\uninstall-service.js" -Encoding UTF8
            Set-Location $InstallPath
            node "$InstallPath\uninstall-service.js"
        }
    } catch {
        Write-ColorText "⚠️ Service removal had issues (continuing...)" $Yellow
    }
    
    # Remove firewall rule
    try {
        Remove-NetFirewallRule -DisplayName "DadsCloud OS" -ErrorAction SilentlyContinue
    } catch {}
    
    # Remove files
    if (Test-Path $InstallPath) {
        Remove-Item $InstallPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # Remove desktop shortcut
    $shortcut = "$env:USERPROFILE\Desktop\DadsCloud OS.lnk"
    if (Test-Path $shortcut) {
        Remove-Item $shortcut -Force
    }
    
    Write-ColorText "✅ DadsCloud OS uninstalled successfully" $Green
}

# Main execution
try {
    Show-Banner
    
    # Check administrator privileges
    if (!(Test-Administrator)) {
        Write-ColorText "❌ Administrator privileges required" $Red
        Write-ColorText "Please run PowerShell as Administrator and try again" $Yellow
        exit 1
    }
    
    if ($Uninstall) {
        Uninstall-DadsCloud
        return
    }
    
    Write-ColorText "🔍 System check..." $Yellow
    Write-ColorText "   OS: $((Get-WmiObject Win32_OperatingSystem).Caption)" $Cyan
    Write-ColorText "   Install Path: $InstallPath" $Cyan
    Write-Host ""
    
    # Install components
    Install-NodeJS
    Install-DadsCloud
    Install-WindowsService
    Add-FirewallRule
    Create-DesktopShortcut
    
    Show-CompletionMessage
    
} catch {
    Write-ColorText "❌ Installation failed: $($_.Exception.Message)" $Red
    Write-ColorText "Please check the error and try again" $Yellow
    exit 1
}