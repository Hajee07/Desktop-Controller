import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
export class ProcessRunner {
  private children = new Set<ReturnType<typeof spawn>>();
  async run(executable:string,args:string[],options:{cwd?:string;signal?:AbortSignal;timeoutMs?:number;allowNetwork?:boolean}={}) {
    options.signal?.throwIfAborted();
    if (!path.isAbsolute(executable) || !/\.exe$/i.test(executable) || (await fs.lstat(executable)).isSymbolicLink()) throw new Error('EXECUTABLE_DENIED: absolute executable required');
    // Do not pass inherited tokens/passwords/API keys to project scripts.
    const env: NodeJS.ProcessEnv = {};
    for(const key of ['SystemRoot','WINDIR','SystemDrive','COMSPEC','TEMP','TMP','PATH','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','JAVA_HOME']) if(process.env[key])env[key]=process.env[key];
    env.NO_COLOR='1';
    options.signal?.throwIfAborted();
    return await new Promise<{stdout:string;stderr:string;exitCode:number}>((resolve,reject)=>{
      const child=spawn(executable,args,{cwd:options.cwd,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
      this.children.add(child);
      let stdout='',stderr='',settled=false,terminalError:Error|undefined;
      const kill=()=>{
        if(child.pid && !child.killed){
          const killer=spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
          killer.on('error',()=>child.kill());
        }
      };
      const finish=(error?:Error,code=0)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);this.children.delete(child);if(error)reject(error);else resolve({stdout,stderr,exitCode:code});};
      const abort=()=>{terminalError=new Error('Operation cancelled');kill();};
      const timer=setTimeout(()=>{terminalError=new Error('Process timeout');kill();},options.timeoutMs??60_000);
      options.signal?.addEventListener('abort',abort,{once:true});
      if(options.signal?.aborted)abort();
      child.stdout.on('data',(d:Buffer)=>{stdout+=d.toString('utf8');if(Buffer.byteLength(stdout)>2_000_000){terminalError=new Error('Output limit exceeded');kill();}});
      child.stderr.on('data',(d:Buffer)=>{stderr+=d.toString('utf8');if(Buffer.byteLength(stderr)>2_000_000){terminalError=new Error('Output limit exceeded');kill();}});
      child.on('error',e=>finish(e));child.on('close',code=>finish(terminalError,code??1));
    });
  }
  async stop():Promise<void> {await Promise.allSettled([...this.children].map(child=>new Promise<void>(resolve=>{
    if(!child.pid||child.exitCode!==null)return resolve();
    const timer=setTimeout(()=>{child.kill();resolve();},5000);timer.unref();
    child.once('close',()=>{clearTimeout(timer);resolve();});
    const p=spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});p.on('error',()=>child.kill());
  })));}
}
