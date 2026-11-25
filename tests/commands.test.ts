import test from 'node:test';
import assert from 'node:assert/strict';
import { powershellTools } from '../src/powershell/index.js';
import { developmentTools } from '../src/development/index.js';
import type {AppContext,CallContext}from'../src/server/types.js';
test('fixed command allowlist previews exact argv and confirms scripts, even if flag is misconfigured',async()=>{
  let runs=0,approvals=0;const args=['--version'];
  const ctx={config:{commands:{version:{executable:process.execPath,args,description:'Version',requiresConfirmation:false,allowNetwork:false},script:{executable:process.execPath,args:['trusted-project.js'],description:'Run trusted project',requiresConfirmation:false,allowNetwork:false}},toolTimeoutMs:1000},paths:{check:async(p:string)=>{if(p!=='fixture')throw new Error('PATH_DENIED');return p;}},emergency:{assertRunning(){}},runProcess:async(exe:string,argv:string[])=>{runs++;assert.equal(exe,process.execPath);assert.ok(argv===args||argv[0]==='trusted-project.js');return{stdout:'ok',stderr:'',exitCode:0};}}as unknown as AppContext;
  const tools=powershellTools(ctx);const call:CallContext={signal:new AbortController().signal,confirm:async()=>{approvals++;}};
  const run=async(name:string,i:any,c=call)=>{const t=tools.find(t=>t.name===name)!;return t.execute(t.schema.parse(i),c)as Promise<any>;};
  assert.equal((await run('powershell_execute_approved',{commandId:'version',cwd:'fixture'})).dryRun,true);assert.equal(runs,0);
  await run('powershell_execute_approved',{commandId:'version',cwd:'fixture',dryRun:false});assert.equal(approvals,0);
  await run('powershell_execute_approved',{commandId:'script',cwd:'fixture',dryRun:false});assert.equal(approvals,1);
  await assert.rejects(run('powershell_execute_approved',{commandId:'evil',cwd:'fixture',dryRun:false}),/DENIED/);
  await assert.rejects(run('powershell_execute_approved',{commandId:'version',cwd:'outside'}),/DENIED/);
  assert.throws(()=>tools[1].schema.parse({commandId:'version',cwd:'fixture',command:'Remove-Item C:\\*'}));
  const denied={...call,confirm:async()=>{throw new Error('declined');}};await assert.rejects(run('powershell_execute_approved',{commandId:'script',cwd:'fixture',dryRun:false},denied),/declined/);assert.equal(runs,2);
  for(const t of developmentTools(ctx).filter(t=>t.name!=='development_inspect'))assert.equal((await t.execute(t.schema.parse({project:'fixture',commandId:'script'}),call)as any).dryRun,true);
});
