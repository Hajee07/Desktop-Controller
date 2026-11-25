import {writeFile,mkdir}from'node:fs/promises';
import path from'node:path';
import{fileURLToPath}from'node:url';
const state=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','.state');
await mkdir(state,{recursive:true});await writeFile(path.join(state,'STOP'),'Emergency stop requested locally.\n');
console.log('Stop requested. Managed work is cancelled; restart and local RESUME confirmation are required to continue.');
