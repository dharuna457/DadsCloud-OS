# DadsCloud OS - Installer with Authentication Setup
Write-Host "Installing DadsCloud OS..." -ForegroundColor Cyan

# Check if running as admin
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Please run as Administrator" -ForegroundColor Red
    exit 1
}

# Install location
$InstallPath = "$env:ProgramFiles\DadsCloud"

Write-Host ""
Write-Host "🔐 DadsCloud OS Security Setup" -ForegroundColor Cyan
Write-Host "Create your admin account for secure access:" -ForegroundColor Yellow
Write-Host ""

# Get username and password
$Username = Read-Host "Enter admin username (default: admin)"
if ([string]::IsNullOrWhiteSpace($Username)) {
    $Username = "admin"
}

$Password = Read-Host "Enter admin password (default: admin123)" -AsSecureString
$PlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password))

if ([string]::IsNullOrWhiteSpace($PlainPassword)) {
    $PlainPassword = "admin123"
}

Write-Host ""
Write-Host "Setting up DadsCloud OS with:" -ForegroundColor Green
Write-Host "  Username: $Username" -ForegroundColor White
Write-Host "  Password: $('*' * $PlainPassword.Length)" -ForegroundColor White
Write-Host ""

# Create directory
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

# Download files from GitHub
Write-Host "Downloading DadsCloud OS files..." -ForegroundColor Yellow
$zipUrl = "https://github.com/dharuna457/DadsCloud-OS/archive/refs/heads/main.zip"
$zipFile = "$env:TEMP\dadscloud.zip"
Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile

# Extract files
Expand-Archive -Path $zipFile -DestinationPath "$env:TEMP\dadscloud-extract" -Force
$extractedFolder = Get-ChildItem "$env:TEMP\dadscloud-extract" | Select-Object -First 1
Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination $InstallPath -Recurse -Force

# Install Node.js if needed
try { 
    $nodeVersion = node --version
    Write-Host "Node.js $nodeVersion found" -ForegroundColor Green
} catch { 
    Write-Host "Installing Node.js..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet" -Wait
    
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    Write-Host "Node.js installed successfully" -ForegroundColor Green
}

# Install npm packages
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Set-Location $InstallPath
npm install --silent

# Create user configuration with credentials
Write-Host "Configuring authentication..." -ForegroundColor Yellow
$configDir = "$InstallPath\config"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null

$userConfig = @{
    users = @{
        $Username = @{
            username = $Username
            password = $PlainPassword
            role = "admin"
            createdAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        }
    }
    security = @{
        sessionTimeout = 86400000
        requireAuth = $true
    }
}

$userConfig | ConvertTo-Json -Depth 4 | Out-File "$configDir\users.json" -Encoding UTF8

# Update server.js to use the config file
$serverPath = "$InstallPath\src\server\app.js"
if (Test-Path $serverPath) {
    # Read the current server file and update it to load users from config
    $serverContent = Get-Content $serverPath -Raw
    
    # Replace the hardcoded users object
    $newUsersCode = @"
// Load users from config file
let users = {};
try {
    const configPath = path.join(__dirname, '../../config/users.json');
    const configData = require('fs').readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    users = config.users;
} catch (error) {
    console.error('Could not load user config, using defaults');
    users = {
        admin: {
            username: 'admin',
            password: 'admin123'
        }
    };
}
"@
    
    $serverContent = $serverContent -replace "const users = \{[\s\S]*?\};", $newUsersCode
    $serverContent | Out-File $serverPath -Encoding UTF8
}

# Create Windows service
Write-Host "Installing Windows service..." -ForegroundColor Yellow
$serviceName = "DadsCloud OS"
$servicePath = "node.exe `"$InstallPath\src\server\app.js`""
$workingDir = $InstallPath

# Stop existing service
Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
sc.exe delete $serviceName 2>$null

# Create batch file for service
$serviceBatch = @"
@echo off
cd /d "$workingDir"
node src\server\app.js
"@
$serviceBatch | Out-File "$InstallPath\dadscloud-service.bat" -Encoding ASCII

# Create service
$createResult = sc.exe create $serviceName binPath= "`"$InstallPath\dadscloud-service.bat`"" start= auto DisplayName= "DadsCloud OS - Personal Cloud"
if ($LASTEXITCODE -eq 0) {
    Start-Service $serviceName -ErrorAction SilentlyContinue
    Write-Host "Service installed and started" -ForegroundColor Green
} else {
    Write-Host "Service creation failed, starting manually..." -ForegroundColor Yellow
    Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "`"$InstallPath\src\server\app.js`""
}

# Create firewall rule
try {
    Remove-NetFirewallRule -DisplayName "DadsCloud OS" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "DadsCloud OS" -Direction Inbound -Protocol TCP -LocalPort 1468 -Action Allow -ErrorAction Stop
    Write-Host "Firewall rule added for port 1468" -ForegroundColor Green
} catch {
    Write-Host "Firewall rule creation failed (DadsCloud will still work locally)" -ForegroundColor Yellow
}

# Create shortcuts
Write-Host "Creating shortcuts..." -ForegroundColor Yellow
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\DadsCloud OS.lnk")
$Shortcut.TargetPath = "http://localhost:1468"
$Shortcut.Description = "DadsCloud OS Dashboard"
$Shortcut.Save()

# Clean up
Remove-Item $zipFile, "$env:TEMP\dadscloud-extract" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "🎉 DadsCloud OS installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Access your dashboard at:" -ForegroundColor Cyan
Write-Host "   http://localhost:1468" -ForegroundColor Yellow
Write-Host ""
Write-Host "🔐 Login credentials:" -ForegroundColor Cyan
Write-Host "   Username: $Username" -ForegroundColor White
Write-Host "   Password: $PlainPassword" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Features:" -ForegroundColor Cyan
Write-Host "   • Real-time system monitoring" -ForegroundColor White
Write-Host "   • Secure authentication" -ForegroundColor White
Write-Host "   • App management system" -ForegroundColor White
Write-Host "   • Auto-starts on boot" -ForegroundColor White
Write-Host "   • Dark theme interface" -ForegroundColor White
Write-Host ""
Write-Host "Opening DadsCloud OS in your browser..." -ForegroundColor Yellow
Start-Sleep 3
Start-Process "http://localhost:1468"
