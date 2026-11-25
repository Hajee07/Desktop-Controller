[CmdletBinding()]
param([switch]$InstallDependencies)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $project
try{
 & node.exe --version
 if($LASTEXITCODE-ne 0){throw 'Node 24.22 LTS required'}
 & dotnet.exe --version
 if($LASTEXITCODE-ne 0){throw '.NET 10 SDK/Desktop Runtime required'}
 if($InstallDependencies){if((Read-Host 'Install locked Node dependencies inside this project? Type INSTALL') -ne 'INSTALL'){throw 'Dependency installation declined'};& npm.cmd ci --ignore-scripts;if($LASTEXITCODE-ne 0){throw 'Dependency installation failed'}}
 if(-not(Test-Path -LiteralPath node_modules)){throw 'Dependencies absent. Review package-lock.json, then rerun with -InstallDependencies'}
 if(-not(Test-Path -LiteralPath config.json)){throw 'Review config.example.json, create config.json with actual authorized paths, then rerun. Existing configs are never replaced.'}
 & npm.cmd run build
 if($LASTEXITCODE-ne 0){throw 'Build failed'}
 & npm.cmd run test:smoke
 if($LASTEXITCODE-ne 0){throw 'STDIO smoke test failed'}
 Write-Output 'Setup verified. Existing Codex registration: reconnect/reopen Codex. For another machine, run npm run register:preview, inspect its output and explicitly apply if approved.'
}finally{Pop-Location}
