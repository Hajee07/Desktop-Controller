import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { defaultConfig } from '../src/config/index.js';
import { createContext } from '../src/server/context.js';
import { createServer } from '../src/server/index.js';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(options:{modern?:boolean;manual?:boolean}={}) {
  await fs.mkdir('test-results',{recursive:true});const project=await fs.mkdtemp(path.resolve('test-results/server-'));
  const folder=path.join(project,'workspace');await fs.mkdir(folder);const filename=path.join(folder,'approved.txt');await fs.writeFile(filename,'original');
  const config=defaultConfig(project);config.browser.enabled=false;config.toolTimeoutMs=3000;
  const ctx=await createContext(config,project);const bridge=ctx.runPowerShell;
  let localCount=0,hostCount=0;let localAccepted=true,hostAccepted=true;let blockLocal=false;let entered!:()=>void;
  const localEntered=new Promise<void>(resolve=>entered=resolve);
  ctx.runPowerShell=async(operation,payload,signal)=>{
    if(operation!=='confirm')return bridge(operation,payload,signal);
    localCount++;entered();
    if(blockLocal)await new Promise<void>((_resolve,reject)=>{if(signal?.aborted)reject(new Error('Cancelled fixture dialog'));else signal?.addEventListener('abort',()=>reject(new Error('Cancelled fixture dialog')),{once:true});});
    return {accepted:localAccepted};
  };
  const server=createServer(ctx);const client=new Client({name:'authorization-regression',version:'1.0.0'},{capabilities:{elicitation:{form:{}}},...(options.modern?{versionNegotiation:{mode:{pin:'2026-07-28'}}}:{}),...(options.manual?{inputRequired:{autoFulfill:false}}:{})});
  client.setRequestHandler('elicitation/create',async()=>{hostCount++;return hostAccepted?{action:'accept',content:{confirm:true}}:{action:'decline'};});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const handle=options.modern?serveStdio(()=>server,{transport:serverTransport}):undefined;
  if(!handle)await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {ctx,server,client,project,filename,folder,localEntered,
    counts:()=>({local:localCount,host:hostCount}),setLocal(value:boolean){localAccepted=value;},setHost(value:boolean){hostAccepted=value;},blockLocal(){blockLocal=true;},
    async call(name:string,args:Record<string,unknown>,extra:Record<string,unknown>={}) {return await client.callTool({name,arguments:args,...extra} as any,{allowInputRequired:options.manual}) as any;},
    async cleanup(){await client.close();await handle?.close();await server.close();await ctx.shutdown();const resolved=path.resolve(project);assert.ok(resolved.startsWith(path.resolve('test-results')+path.sep));await fs.rm(resolved,{recursive:true,force:true});}
  };
}

test('MCP destructive tools advertise destructive rather than read-only annotations',async()=>{
  const f=await fixture();try{const result=await f.client.listTools();for(const name of ['filesystem_edit','filesystem_delete','filesystem_move','database_modify','desktop_click']){const tool=result.tools.find(item=>item.name===name)!;assert.equal(tool.annotations?.destructiveHint,true,name);assert.equal(tool.annotations?.readOnlyHint,false,name);}}finally{await f.cleanup();}
});
test('host decline prevents the local dialog and leaves edit/delete source untouched',async()=>{
  const f=await fixture();try{f.setHost(false);for(const name of ['filesystem_edit','filesystem_delete']){const args=name==='filesystem_edit'?{path:f.filename,content:'replacement',expectedSha256:sha('original'),dryRun:false}:{path:f.filename,dryRun:false};const result=await f.call(name,args);assert.equal(result.isError,true,name);assert.equal(await fs.readFile(f.filename,'utf8'),'original');}assert.deepEqual(f.counts(),{host:2,local:0});assert.deepEqual(await fs.readdir(path.join(f.project,'.state','backups')),[]);}finally{await f.cleanup();}
});
test('local decline after host acceptance prevents edit/delete and makes no backup',async()=>{
  const f=await fixture();try{f.setLocal(false);for(const name of ['filesystem_edit','filesystem_delete']){const args=name==='filesystem_edit'?{path:f.filename,content:'replacement',expectedSha256:sha('original'),dryRun:false}:{path:f.filename,dryRun:false};const result=await f.call(name,args);assert.equal(result.isError,true,name);assert.match(JSON.stringify(result),/local user declined/);assert.equal(await fs.readFile(f.filename,'utf8'),'original');}assert.deepEqual(f.counts(),{host:2,local:2});assert.deepEqual(await fs.readdir(path.join(f.project,'.state','backups')),[]);}finally{await f.cleanup();}
});
test('both host and local acceptance perform a real backed-up edit over MCP',async()=>{
  const f=await fixture();try{const result=await f.call('filesystem_edit',{path:f.filename,content:'replacement',expectedSha256:sha('original'),dryRun:false});assert.ok(!result.isError,JSON.stringify(result));assert.deepEqual(f.counts(),{host:1,local:1});assert.equal(await fs.readFile(f.filename,'utf8'),'replacement');const data=JSON.parse(result.content[0].text);assert.equal(await fs.readFile(data.backup,'utf8'),'original');}finally{await f.cleanup();}
});
test('modern MCP approval state is bound to exact input and cannot be reused for different edits',async()=>{
  const f=await fixture({modern:true,manual:true});try{
    const args={path:f.filename,content:'first replacement',expectedSha256:sha('original'),dryRun:false};
    const pending=await f.call('filesystem_edit',args);assert.equal(pending.resultType,'input_required');assert.equal(typeof pending.requestState,'string');assert.deepEqual(f.counts(),{host:0,local:0});
    const changed=await f.call('filesystem_edit',{...args,content:'different replacement'},{requestState:pending.requestState,inputResponses:{confirmation:{action:'accept',content:{confirm:true}}}});assert.equal(changed.isError,true);assert.match(JSON.stringify(changed),/changed operation/);assert.equal(await fs.readFile(f.filename,'utf8'),'original');assert.deepEqual(f.counts(),{host:0,local:0});
    const fresh=await f.call('filesystem_edit',args);assert.equal(fresh.resultType,'input_required');
    const accepted=await f.call('filesystem_edit',args,{requestState:fresh.requestState,inputResponses:{confirmation:{action:'accept',content:{confirm:true}}}});assert.ok(!accepted.isError,JSON.stringify(accepted));assert.equal(await fs.readFile(f.filename,'utf8'),'first replacement');assert.deepEqual(f.counts(),{host:0,local:1});
    // Restore the original fixture externally to make a replay's attempted edit observable.
    await fs.writeFile(f.filename,'original');
    const replay=await f.call('filesystem_edit',args,{requestState:fresh.requestState,inputResponses:{confirmation:{action:'accept',content:{confirm:true}}}});assert.equal(replay.resultType,'input_required');assert.equal(await fs.readFile(f.filename,'utf8'),'original');assert.deepEqual(f.counts(),{host:0,local:1});
  }finally{await f.cleanup();}
});
test('emergency stop bypasses a blocked dialog, cancels the pending edit, and rejects later work',async()=>{
  const f=await fixture();try{
    f.blockLocal();const edit=f.call('filesystem_edit',{path:f.filename,content:'must not commit',expectedSha256:sha('original'),dryRun:false});await f.localEntered;
    const stopped=await f.call('system_emergency_stop',{});assert.ok(!stopped.isError,JSON.stringify(stopped));const result=await edit;assert.equal(result.isError,true);assert.equal(await fs.readFile(f.filename,'utf8'),'original');
    const later=await f.call('filesystem_read',{path:f.filename});assert.equal(later.isError,true);assert.match(JSON.stringify(later),/EMERGENCY_STOP/);
  }finally{await f.cleanup();}
});
