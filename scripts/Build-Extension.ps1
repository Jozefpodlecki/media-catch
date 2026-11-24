[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction Stop
& $nodeCommand.Source (Join-Path $PSScriptRoot 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Extension compilation failed.' }
$sourceRoot = Join-Path $projectRoot 'extension'
$outputRoot = Join-Path $projectRoot 'dist'
$null = New-Item -ItemType Directory -Path $outputRoot -Force
# UTC is unambiguous across machines; milliseconds plus a suffix handle collisions.
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffZ')
$packageName = "media-catch-$timestamp"
$sequence = 0
while ((Test-Path -LiteralPath (Join-Path $outputRoot "$packageName.zip")) -or
       (Test-Path -LiteralPath (Join-Path $outputRoot "$packageName.xpi"))) {
    $sequence++
    $packageName = "media-catch-$timestamp-$sequence"
}
$zipPath = Join-Path $outputRoot "$packageName.zip"
$xpiPath = Join-Path $outputRoot "$packageName.xpi"

# Place manifest.json at the archive root, including any future source assets.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $zipPath)
Copy-Item -LiteralPath $zipPath -Destination $xpiPath
Write-Output "Unsigned development packages:"
Write-Output $zipPath
Write-Output $xpiPath
