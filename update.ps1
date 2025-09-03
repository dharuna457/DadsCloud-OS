# DadsCloud OS - Update Script
Write-Host "Updating DadsCloud OS..." -ForegroundColor Cyan

$InstallPath = "$env:ProgramFiles\DadsCloud"

# Stop current instance
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*DadsCloud*" } | Stop-Process -Force

# Download latest files
Write-Host "Downloading latest version..." -ForegroundColor Yellow
$zipUrl = "https://github.com/dharuna457/DadsCloud-OS/archive/refs/heads/main.zip"
$zipFile = "$env:TEMP\dadscloud-update.zip"
Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile

# Extract and replace files
Expand-Archive -Path $zipFile -DestinationPath "$env:TEMP\dadscloud-update" -Force
$extractedFolder = Get-ChildItem "$env:TEMP\dadscloud-update" | Select-Object -First 1
Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination $InstallPath -Recurse -Force

# Update dependencies
Set-Location $InstallPath
npm install --silent

# Restart DadsCloud
Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "`"$InstallPath\src\server\app.js`""

# Clean up
Remove-Item $zipFile, "$env:TEMP\dadscloud-update" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "DadsCloud OS updated successfully!" -ForegroundColor Green
Start-Process "http://localhost:1468"
