import path from 'node:path';
import {fileURLToPath}from'node:url';
import{readdirSync}from'node:fs';
import{spawn}from'node:child_process';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=readdirSync(path.join(project,'tests')).filter(f=>f.endsWith('.test.ts')).map(f=>path.join(project,'tests',f));
const child=spawn(process.execPath,[path.join(project,'node_modules','tsx','dist','cli.mjs'),'--test','--test-concurrency=1',...files],{cwd:project,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:path.join(project,'.state','browsers')},stdio:'inherit',shell:false});
child.once('error',e=>{console.error(e.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
