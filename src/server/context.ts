import {ManagedStorage,reserveOutput} from '../storage/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthorizedPaths } from '../security/paths.js';
import { EmergencyStop } from '../security/emergency.js';
import { AuditLog } from '../audit/index.js';
import { ProcessRunner } from '../utils/process.js';
import { approvedPowerShell } from '../utils/powershell.js';
import type { AppConfig, AppContext } from './types.js';
export async function createContext(config:AppConfig,projectDir:string):Promise<AppContext & {shutdown():Promise<void>;emergency:EmergencyStop}> {
  await new AuthorizedPaths([projectDir]).check(projectDir);
  await fs.mkdir(config.stateDir).catch((e:any)=>{if(e.code!=='EEXIST')throw e;});
  const st=await fs.lstat(config.stateDir);if(st.isSymbolicLink()||(await fs.realpath(config.stateDir)).toLowerCase()!==path.resolve(config.stateDir).toLowerCase())throw new Error('Unsafe state directory');
  for(const name of ['backups','audit.sqlite','STOP','browser-profile','temp',...['storage','office-transactions','execution-queue'].flatMap(name=>['.sqlite','.sqlite-wal','.sqlite-shm','.sqlite-journal'].map(ext=>name+ext))]){try{const s=await fs.lstat(path.join(config.stateDir,name));if(s.isSymbolicLink()||(s.isFile()&&s.nlink>1))throw new Error('Unsafe state child');}catch(e:any){if(e.code!=='ENOENT')throw e;}}
  await fs.mkdir(path.join(config.stateDir,'backups'),{recursive:true});
  const protectedPaths=[config.stateDir,...['src','scripts','dist','node_modules','config.json','package.json','package-lock.json','tsconfig.json'].map(p=>path.join(projectDir,p))];
  const paths=new AuthorizedPaths(config.authorizedRoots,protectedPaths);const audit=new AuditLog(config.stateDir);const runner=new ProcessRunner();const emergency=new EmergencyStop(config.stateDir);emergency.onStop(()=>runner.stop());
  let shuttingDown:Promise<void>|undefined;
  const ctx:AppContext & {shutdown():Promise<void>;emergency:EmergencyStop}={config,projectDir,paths,audit,emergency,
    runProcess:(exe,args,opts)=>runner.run(exe,args,opts),
    async runPowerShell(operation,payload,signal){
      const allowed=['info','drives','applications','discover-apps','windows','active','open','open-file','close','focus','inspect','click','type','scroll','screenshot','confirm','recycle'];
      if(!allowed.includes(operation))throw new Error('POWERSHELL_OPERATION_DENIED');
      signal?.throwIfAborted();emergency.assertRunning();
      const encoded=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');if(encoded.length>40000)throw new Error('PowerShell payload too large');
      const result=await runner.run(await approvedPowerShell(),['-NoLogo','-NoProfile','-NonInteractive','-STA','-File',path.join(projectDir,'scripts','windows-bridge.ps1'),'-Operation',operation,'-Payload',encoded],{signal,timeoutMs:config.toolTimeoutMs});
      if(result.exitCode!==0)throw new Error(`WINDOWS_OPERATION_FAILED: ${operation}`);
      try{return JSON.parse(result.stdout.replace(/^\uFEFF/,''));}catch{throw new Error('Invalid Windows bridge response');}
    },
    async backup(input){let target:string;try{target=await paths.check(input);}catch(e:any){if(e.code==='ENOENT')return null;throw e;}const s=await fs.stat(target);if(!s.isFile())throw new Error('Backup only supports ordinary files');if(s.size>config.maxReadBytes)throw new Error('Backup exceeds the configured file size limit');const dst=path.join(config.stateDir,'backups',`${randomUUID()}.bak`);const release=await reserveOutput(ctx,dst,s.size+65536);try{await fs.copyFile(target,dst,1);await fs.writeFile(`${dst}.json`,JSON.stringify({originalPath:target,createdAt:new Date().toISOString(),size:s.size}));}finally{release();}return dst;},
    shutdown(){return shuttingDown??=(async()=>{await emergency.dispose();audit.close();ctx.storage?.close();})();}
  };
  ctx.storage=new ManagedStorage(ctx);
  emergency.onStop(async()=>{});
  return ctx;
}
