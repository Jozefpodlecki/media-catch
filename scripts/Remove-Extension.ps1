[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction Stop
$sessionScript = Join-Path $PSScriptRoot 'dev-session.mjs'
if ($DryRun) {
    & $nodeCommand.Source $sessionScript stop --dry-run
} else {
    & $nodeCommand.Source $sessionScript stop
}
if ($LASTEXITCODE -ne 0) { throw "Could not stop the development session (exit $LASTEXITCODE)." }
