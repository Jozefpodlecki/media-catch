$ErrorActionPreference = 'Stop'
# Compatibility entry point. New scripts live under scripts/.
& (Join-Path $PSScriptRoot 'scripts\Build-Extension.ps1')
