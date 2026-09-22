<#
.SYNOPSIS
    Start Below Deck Tracker locally.

.DESCRIPTION
    .\start.ps1            Run with Node directly, restarting on save (fastest).
    .\start.ps1 -Docker    Run in Docker, the same way the server does.
    .\start.ps1 -Prod      Build and run the production image locally.
#>
[CmdletBinding()]
param(
    [switch]$Docker,
    [switch]$Prod
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if ($Docker -and $Prod) {
    Write-Error 'Choose either -Docker or -Prod, not both.'
    exit 1
}

$port = if ($env:HTTP_PORT) { $env:HTTP_PORT } else { '3100' }

if ($Prod) {
    Write-Host "Building the production image and starting on http://localhost:$port"
    $env:HTTP_PORT = $port
    docker compose up --build
}
elseif ($Docker) {
    Write-Host "Starting in Docker on http://localhost:$port (Ctrl+C to stop)"
    $env:HTTP_PORT = $port
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
}
else {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error 'Node.js is not installed. Install Node 20+ or use: .\start.ps1 -Docker'
        exit 1
    }

    if (-not (Test-Path 'node_modules')) {
        Write-Host 'Installing dependencies...'
        npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    # Node runs outside Docker, so it doesn't get docker-compose's automatic
    # .env loading — pick up AISSTREAM_API_KEY etc. ourselves if it exists.
    if (Test-Path '.env') {
        Get-Content '.env' | ForEach-Object {
            if ($_ -match '^\s*([^#=\s][^=]*)\s*=\s*(.*)\s*$') {
                Set-Item -Path "env:$($Matches[1])" -Value $Matches[2]
            }
        }
    }

    Write-Host "Starting on http://localhost:$port (Ctrl+C to stop)"
    $env:PORT = $port
    npm run dev
}

exit $LASTEXITCODE
