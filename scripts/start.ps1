[CmdletBinding()]
param([switch]$Dashboard,[switch]$Worker)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(-not(Test-Path -LiteralPath (Join-Path $project 'dist\index.js'))){throw 'Build first: npm run build'}
Push-Location -LiteralPath $project
try{if($Dashboard){& $node (Join-Path $project 'scripts\dashboard.mjs')}elseif($Worker){& $node (Join-Path $project 'dist\runtime\worker.js')}else{& $node (Join-Path $project 'dist\index.js')}}finally{Pop-Location}
