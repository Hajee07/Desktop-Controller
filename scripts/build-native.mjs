import {spawnSync}from'node:child_process';import path from'node:path';import{fileURLToPath}from'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=spawnSync('dotnet',['build','src/windows/native/WindowsHelper.csproj','-c','Release','--nologo','-o','dist/native'],{cwd:project,stdio:'inherit',windowsHide:true,env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_CLI_HOME:path.join(project,'.dotnet')}});process.exitCode=result.status??1;
