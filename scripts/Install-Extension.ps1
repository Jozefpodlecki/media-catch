[CmdletBinding()]
param(
    [string]$BrowserPath = 'C:\Users\jozef\Desktop\Tor Browser\Browser\firefox.exe',
    [string]$ProfilePath,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ProfilePath) {
    $ProfilePath = Join-Path (Split-Path -Parent $BrowserPath) 'TorBrowser\Data\Browser\profile.default'
}
if (-not (Test-Path -LiteralPath $BrowserPath -PathType Leaf)) { throw "Browser executable not found: $BrowserPath" }
if (-not (Test-Path -LiteralPath $ProfilePath -PathType Container)) { throw "Tor profile not found: $ProfilePath. Supply -ProfilePath explicitly." }
$nodeCommand = Get-Command node -ErrorAction Stop
$sessionScript = Join-Path $PSScriptRoot 'dev-session.mjs'
$sessionArguments = @($sessionScript, 'start', '--browser', $BrowserPath, '--profile', $ProfilePath)
if ($DryRun) {
    & $nodeCommand.Source @sessionArguments --dry-run
} else {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\web-ext\package.json'))) {
        throw 'Run npm ci in the project directory first, then run this script again.'
    }
    & $nodeCommand.Source (Join-Path $PSScriptRoot 'build.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Extension compilation failed.' }
    Write-Host 'Starting a temporary extension session. Keep this terminal open.'
    Write-Host 'The development copy will pin this extension to the toolbar and allow it in private windows and on sites with restrictions.'
    Write-Host 'Close the development browser, press Ctrl+C, or run scripts\Remove-Extension.ps1 in another terminal to remove it.'
    & $nodeCommand.Source @sessionArguments
}
if ($LASTEXITCODE -ne 0) { throw "Extension session failed (exit $LASTEXITCODE)." }
