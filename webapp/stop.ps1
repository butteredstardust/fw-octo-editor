$port = 3000

$connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $connection) {
    Write-Host "No process is listening on port $port. Server may already be stopped."
    exit 0
}

$process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
if (-not $process -or $process.ProcessName -ne 'node') {
    Write-Host "Port $port is occupied by '$($process.ProcessName)' (PID $($connection.OwningProcess)). Not a Node.js process. Aborting."
    exit 1
}

Write-Host "Stopping Node.js server (PID $($connection.OwningProcess)) on port $port..."
Stop-Process -Id $connection.OwningProcess -Force

Start-Sleep -Milliseconds 500
$stillListening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($stillListening) {
    Write-Host "WARNING: Port $port is still responding. The process may still be running."
    exit 1
}

Write-Host "Server stopped successfully. Port $port is free."
exit 0
