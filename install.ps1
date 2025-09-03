Write-Host "Installing DadsCloud OS..." -ForegroundColor Cyan

# Check if running as admin
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Please run as Administrator" -ForegroundColor Red
    exit 1
}

# Install location
$InstallPath = "$env:ProgramFiles\DadsCloud"

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
try { node --version } catch { 
    Write-Host "Installing Node.js..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet" -Wait
}

# Install npm packages
Set-Location $InstallPath
npm install --silent

# Create Windows service
$serviceName = "DadsCloud OS"
sc.exe create $serviceName binPath= "node `"$InstallPath\src\server\app.js`"" start= auto | Out-Null
Start-Service $serviceName

# Clean up
Remove-Item $zipFile, "$env:TEMP\dadscloud-extract" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "DadsCloud OS installed successfully!" -ForegroundColor Green
Write-Host "Open: http://localhost:1468" -ForegroundColor Yellow
Start-Process "http://localhost:1468"
