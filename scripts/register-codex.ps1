[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$codexCommand = Get-Command codex.exe -ErrorAction Stop
Write-Host ('Windows user: ' + [Environment]::UserName)
Write-Host ('Project installation: ' + $projectPath)
Write-Host ('Node: ' + $nodeCommand.Source)
Write-Host ('npm: ' + $npmCommand.Source)
Write-Host ('Codex: ' + $codexCommand.Source)
$registrationArguments = @((Join-Path $PSScriptRoot 'register-codex.mjs'))
if ($Apply) { $registrationArguments += '--apply' }
if ($ConfigPath) { $registrationArguments += @('--config-path', [System.IO.Path]::GetFullPath($ConfigPath)) }
Push-Location -LiteralPath $projectPath
try {
    & $nodeCommand.Source @registrationArguments
    if ($LASTEXITCODE -ne 0) { throw ('Registration command failed with exit code ' + $LASTEXITCODE) }
} finally { Pop-Location }
