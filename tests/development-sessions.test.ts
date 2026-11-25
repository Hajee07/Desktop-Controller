import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { developmentSessionTools } from '../src/development/sessions.js';
import type { AppConfig, AppContext, CallContext } from '../src/server/types.js';

test('owned development sessions preview, confirm, capture output, stop, and respond to emergency stop',async()=>{
  const base=path.resolve('test-results');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'dev-session-')),script=path.join(dir,'fixture.cjs');
  await writeFile(script,"console.log('fixture started'); console.log('token=SHOULD_REDACT'); setInterval(()=>{},1000);");
  let onStop:(()=>Promise<void>)|undefined,confirmations=0;
  const ctx={config:{commands:{fixture:{executable:process.execPath,args:[script],description:'Temporary isolated timer fixture',requiresConfirmation:true,allowNetwork:false}}} as unknown as AppConfig,paths:{check:async(p:string)=>{const absolute=path.resolve(p);if(!absolute.startsWith(dir))throw new Error('Outside root');return absolute;}},emergency:{assertRunning(){},onStop(fn:()=>Promise<void>){onStop=fn;}}} as unknown as AppContext;
  const call:CallContext={signal:new AbortController().signal,confirm:async()=>{confirmations++;}};const tools=developmentSessionTools(ctx);
  const run=async(name:string,args:Record<string,unknown>,c=call)=>{const tool=tools.find(t=>t.name===name)!;return tool.execute(tool.schema.parse(args),c) as Promise<any>;};
  try{
    assert.equal((await run('development_session_start',{project:dir,commandId:'fixture'})).dryRun,true);assert.equal(confirmations,0);
    await assert.rejects(run('development_session_start',{project:dir,commandId:'unknown',dryRun:false}),/not locally configured/);
    const denied:CallContext={...call,confirm:async()=>{throw new Error('Declined');}};await assert.rejects(run('development_session_start',{project:dir,commandId:'fixture',dryRun:false},denied),/Declined/);
    const started=await run('development_session_start',{project:dir,commandId:'fixture',dryRun:false});assert.equal(started.running,true);assert.equal(confirmations,1);assert.match(started.id,/^[a-f\d-]{36}$/);
    let status:any;for(let n=0;n<20;n++){status=await run('development_session_status',{sessionId:started.id,includeOutput:true});if(status.sessions[0].stdout.includes('fixture started'))break;await new Promise(r=>setTimeout(r,50));}
    assert.match(status.sessions[0].stdout,/fixture started/);assert.doesNotMatch(status.sessions[0].stdout,/SHOULD_REDACT/);
    assert.equal((await run('development_session_stop',{sessionId:started.id})).dryRun,true);
    assert.equal((await run('development_session_stop',{sessionId:started.id,dryRun:false})).stopped,true);
    const active=[];for(let n=0;n<4;n++)active.push(await run('development_session_start',{project:dir,commandId:'fixture',dryRun:false}));
    await assert.rejects(run('development_session_start',{project:dir,commandId:'fixture',dryRun:false}),/four development sessions/);
    await onStop!();for(const another of active)assert.equal((await run('development_session_status',{sessionId:another.id})).sessions[0].running,false);
    const cancelled=new AbortController();cancelled.abort();await assert.rejects(run('development_session_start',{project:dir,commandId:'fixture',dryRun:false},{...call,signal:cancelled.signal}));
    assert.throws(()=>tools.find(t=>t.name==='development_session_stop')!.schema.parse({sessionId:'123',pid:123}));
  }finally{await onStop?.();await rm(dir,{recursive:true,force:true});}
});
