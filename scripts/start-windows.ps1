# Builds the Prelegal Docker image and (re)starts it at http://localhost:8000.
# Each start creates a new container, so the database starts empty.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$Name = "prelegal"
$Port = 8000

$EnvFile = @()
if (Test-Path ".env") {
    $EnvFile = @("--env-file", ".env")
} else {
    Write-Warning "No .env file in the project root; starting without API keys."
}

docker build -t $Name .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker rm -f $Name 2>$null | Out-Null
docker run -d --name $Name -p "${Port}:8000" @EnvFile $Name | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for Prelegal to start..."
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host "Prelegal is running at http://localhost:$Port"
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}
Write-Error "Prelegal did not start. Logs:`n$(docker logs $Name 2>&1 | Out-String)"
exit 1
