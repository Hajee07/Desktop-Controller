import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {developmentTools}from'../src/development/index.js';
import {AuthorizedPaths}from'../src/security/paths.js';
import {EmergencyStop}from'../src/security/emergency.js';
import type{AppContext,CallContext}from'../src/server/types.js';
test('project inspection reads authorized Node React Python Java Android manifests without executing them',async()=>{
 const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'inspect-'));
 try{
  const manifests={'package.json':'{"dependencies":{"react":"fixture"},"scripts":{"test":"never-executed"}}','tsconfig.json':'{}','pyproject.toml':'[project]\nname="fixture"','requirements.txt':'fixture-only','pom.xml':'<project/>','build.gradle.kts':'// fixture','settings.gradle.kts':'// fixture','gradle.properties':'fixture=true'};
  for(const[name,text]of Object.entries(manifests))await fs.writeFile(path.join(dir,name),text);
  const ctx={config:{commands:{version:{}}},paths:new AuthorizedPaths([dir])}as unknown as AppContext;
  const tool=developmentTools(ctx).find(t=>t.name==='development_inspect')!;
  const call:CallContext={signal:new AbortController().signal,confirm:async()=>{throw new Error('Inspection must not execute');}};
  const result=await tool.execute(tool.schema.parse({project:dir}),call)as any;
  for(const[name,text]of Object.entries(manifests))assert.equal(result.manifests[name],text);
  await assert.rejects(tool.execute({project:path.dirname(dir)},call),/DENIED/);
 }finally{assert.equal(path.dirname(await fs.realpath(dir)),base);await fs.rm(dir,{recursive:true,force:true});}
});
test('normal disconnect disposes managed resources without persisting emergency stop',async()=>{
 const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'dispose-'));let disposed=0;
 try{const stop=new EmergencyStop(dir);const controller=new AbortController();stop.track(controller);stop.onStop(async()=>{disposed++;});await stop.dispose();assert.equal(disposed,1);assert.equal(controller.signal.aborted,true);await assert.rejects(fs.stat(path.join(dir,'STOP')),(e:any)=>e.code==='ENOENT');}
 finally{assert.equal(path.dirname(await fs.realpath(dir)),base);await fs.rm(dir,{recursive:true,force:true});}
});
