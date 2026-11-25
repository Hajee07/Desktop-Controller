import{spawn}from'node:child_process';import path from'node:path';import{fileURLToPath}from'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(path.join(project,'dist/native/WindowsHelper.exe'),['--dashboard',process.execPath,project],{windowsHide:false,stdio:'ignore',detached:false});child.once('error',e=>{console.error(e.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??0;});
