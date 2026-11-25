import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppContext, CallContext, ToolDefinition } from '../server/types.js';

const MAX_SESSIONS=4,MAX_OUTPUT=256*1024,MAX_LIFETIME=60*60*1000;
type Session={id:string;commandId:string;project:string;child:ChildProcessWithoutNullStreams;started:number;expires:number;stdout:string;stderr:string;truncated:boolean;exitCode:number|null;error?:string;timer:ReturnType<typeof setTimeout>;stopping?:Promise<void>};
function scrub(text:string):string{return text.replace(/(bearer\s+)\S+/ig,'$1[REDACTED]').replace(/((?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*)[^\s,;&]+/ig,'$1[REDACTED]');}
function environment():NodeJS.ProcessEnv{
  const env:NodeJS.ProcessEnv={};for(const key of ['SystemRoot','WINDIR','SystemDrive','COMSPEC','TEMP','TMP','PATH','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','JAVA_HOME'])if(process.env[key])env[key]=process.env[key];env.NO_COLOR='1';return env;
}
async function executable(file:string):Promise<string>{
  if(!path.isAbsolute(file)||!/\.exe$/i.test(file)||/^(?:\\\\|\/\/)/.test(file))throw new Error('Development sessions require an absolute local .exe executable.');
  const target=path.resolve(file);if(/[:\x00-\x1f]/.test(target.slice(path.parse(target).root.length)))throw new Error('Executable alternate data streams and control characters are prohibited.');let cursor=path.parse(target).root;
  for(const part of target.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw new Error('Executable links and junctions are prohibited.');if((await realpath(cursor)).toLowerCase()!==cursor.toLowerCase())throw new Error('Executable aliases and reparse points are prohibited.');}
  if(!(await stat(target)).isFile())throw new Error('Executable must be a regular file.');return target;
}
function running(s:Session):boolean{return s.child.exitCode===null&&s.child.signalCode===null&&!s.error;}
function summary(s:Session){return{id:s.id,commandId:s.commandId,project:s.project,pid:s.child.pid,running:running(s),started:new Date(s.started).toISOString(),expires:new Date(s.expires).toISOString(),exitCode:s.exitCode,error:s.error,outputTruncated:s.truncated};}
function waitClose(child:ChildProcessWithoutNullStreams,ms:number):Promise<boolean>{
  if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve(true);
  return new Promise(resolve=>{const finish=(closed:boolean)=>{clearTimeout(timer);child.removeListener('exit',exit);resolve(closed);};const exit=()=>finish(true);const timer=setTimeout(()=>finish(false),ms);child.once('exit',exit);});
}

/** Foreground owned children only. No daemon attachment or arbitrary PID termination. */
export function developmentSessionTools(ctx:AppContext):ToolDefinition[]{
  const sessions=new Map<string,Session>();let pendingStarts=0;
  function active(call:CallContext){call.signal.throwIfAborted();ctx.emergency.assertRunning();}
  function find(id:string):Session{const s=sessions.get(id);if(!s)throw new Error('Unknown development session.');return s;}
  async function taskkill(s:Session,force:boolean):Promise<void>{
    if(!running(s)||!s.child.pid)return;
    const systemRoot=process.env.SystemRoot??'C:\\Windows';
    const killer=spawn(path.join(systemRoot,'System32','taskkill.exe'),['/PID',String(s.child.pid),'/T',...(force?['/F']:[])],{windowsHide:true,shell:false,stdio:'ignore',env:environment()});
    await new Promise<void>(resolve=>{const timeout=setTimeout(()=>{killer.kill();resolve();},5000);const done=()=>{clearTimeout(timeout);resolve();};killer.once('close',done);killer.once('error',()=>{if(force&&running(s))s.child.kill();done();});});
  }
  async function stop(s:Session):Promise<void>{
    if(s.stopping)return s.stopping;
    s.stopping=(async()=>{clearTimeout(s.timer);if(!running(s))return;await taskkill(s,false);if(await waitClose(s.child,1500))return;await taskkill(s,true);if(!await waitClose(s.child,5000)){if(running(s))s.child.kill();if(!await waitClose(s.child,1500))throw new Error('Owned development process did not exit; inspect its status locally.');}})();
    return s.stopping;
  }
  ctx.emergency.onStop(async()=>{await Promise.all([...sessions.values()].map(stop));});
  const sessionSchema=z.object({sessionId:z.string().uuid()}).strict();
  const startSchema=z.object({project:z.string().min(1),commandId:z.string().min(1).max(100),dryRun:z.boolean().default(true)}).strict();
  return [
    {name:'development_session_start',description:'Preview or start a foreground local development server/debugger using one configured fixed executable+argv in an authorized project. Always confirms exact command and effects. At most four sessions; expires after one hour. Commands must bind their own listeners to 127.0.0.1; this is not an OS network sandbox.',schema:startSchema,readOnly:false,destructive:true,openWorld:true,execute:async(a,call)=>{
      const command=Object.hasOwn(ctx.config.commands,a.commandId)?ctx.config.commands[a.commandId]:undefined;if(!command)throw new Error('Command ID is not locally configured.');
      const project=await ctx.paths.check(a.project,'read');if(!(await stat(project)).isDirectory())throw new Error('Project must be a directory.');
      const exe=await executable(command.executable);const preview={commandId:a.commandId,executable:exe,args:command.args,project,description:command.description,allowNetwork:command.allowNetwork,maxLifetimeSeconds:3600};
      if(a.dryRun)return{dryRun:true,...preview};
      if([...sessions.values()].filter(running).length+pendingStarts>=MAX_SESSIONS)throw new Error('At most four development sessions may run concurrently.');
      await call.confirm('Start managed development session',`${JSON.stringify(preview,null,2)}\nThis foreground command runs as your Windows user and may read/write files or use the network. It is not sandboxed. Bind local servers to 127.0.0.1. Do not configure daemonizing commands. The server stops it after one hour or on emergency stop.`);
      active(call);if([...sessions.values()].filter(running).length+pendingStarts>=MAX_SESSIONS)throw new Error('At most four development sessions may run concurrently.');pendingStarts++;
      try{
        await executable(exe);const cwd=await ctx.paths.check(project,'read');active(call);
        // Remove completed records first to keep memory and session metadata bounded.
        for(const [id,s]of sessions)if(!running(s)){clearTimeout(s.timer);sessions.delete(id);}
        const child=spawn(exe,command.args,{cwd,env:environment(),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
        child.stdin.end();
        const now=Date.now(),id=randomUUID();
        const s:Session={id,commandId:a.commandId,project:cwd,child,started:now,expires:now+MAX_LIFETIME,stdout:'',stderr:'',truncated:false,exitCode:null,timer:setTimeout(()=>{void stop(s).catch(()=>{});},MAX_LIFETIME)};
        s.timer.unref();sessions.set(id,s);
        const append=(stream:'stdout'|'stderr',chunk:Buffer)=>{s[stream]+=scrub(chunk.toString('utf8'));if(Buffer.byteLength(s.stdout)+Buffer.byteLength(s.stderr)>MAX_OUTPUT){s.truncated=true;s.stdout=Buffer.from(s.stdout).subarray(-MAX_OUTPUT/4).toString('utf8');s.stderr=Buffer.from(s.stderr).subarray(-MAX_OUTPUT/4).toString('utf8');}};
        child.stdout.on('data',d=>append('stdout',d));child.stderr.on('data',d=>append('stderr',d));child.stdin.on('error',()=>{});
        child.on('exit',code=>{s.exitCode=code;clearTimeout(s.timer);});child.on('error',e=>{s.error=scrub(e.message).slice(0,500);clearTimeout(s.timer);});
        const abort=()=>{void stop(s).catch(()=>{});};call.signal.addEventListener('abort',abort,{once:true});
        try{await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});active(call);}catch(e){await stop(s);throw e;}finally{call.signal.removeEventListener('abort',abort);}
        return{...summary(s),note:'Use development_session_status for bounded output and development_session_stop to stop this owned process.'};
      }finally{pendingStarts--;}
    }},
    {name:'development_session_status',description:'List owned foreground development sessions, or inspect one session with bounded, redacted stdout/stderr. Never reads output or status from unrelated processes.',schema:z.object({sessionId:z.string().uuid().optional(),includeOutput:z.boolean().default(false)}).strict(),readOnly:true,execute:async(a)=>{
      const result=a.sessionId?[find(a.sessionId)]:[...sessions.values()];return{sessions:result.map(s=>({...summary(s),...(a.includeOutput?{stdout:scrub(s.stdout),stderr:scrub(s.stderr)}:{})}))};
    }},
    {name:'development_session_stop',description:'Preview or stop one server-owned development process tree after confirmation. Requests a normal Windows close, then force-closes only that owned tree if needed. No arbitrary PID input.',schema:sessionSchema.extend({dryRun:z.boolean().default(true)}),readOnly:false,destructive:true,execute:async(a,call)=>{
      const s=find(a.sessionId);if(a.dryRun)return{dryRun:true,...summary(s)};await call.confirm('Stop owned development session',JSON.stringify(summary(s),null,2)+'\nClose this owned process tree; unsaved in-memory process state may be lost.');active(call);await stop(s);return{...summary(s),stopped:!running(s)};
    }}
  ];
}
