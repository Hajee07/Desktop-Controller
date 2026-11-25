import {MAX_EXTRACTED_TEXT_CHARACTERS} from '../src/utils/text-limits.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {configSchema,defaultConfig} from '../src/config/index.js';
import {createContext} from '../src/server/context.js';
import {filesystemTools} from '../src/filesystem/index.js';
import {hashFile,MAX_FILE_BYTES,readTextPrefix} from '../src/utils/files.js';
import type {CallContext} from '../src/server/types.js';

async function fixture(t:any){
  const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});
  const project=await fs.mkdtemp(path.join(base,'large-files-')),root=path.join(project,'workspace');await fs.mkdir(root);
  const config=defaultConfig(project);config.maxReadBytes=MAX_FILE_BYTES;
  const ctx=await createContext(config,project);let approvals=0;
  const call:CallContext={signal:new AbortController().signal,confirm:async()=>{approvals++;}};
  const run=async(name:string,input:any)=>{const tool=filesystemTools(ctx).find(x=>x.name===name)!;return await tool.execute(tool.schema.parse(input),call) as any;};
  t.after(async()=>{await ctx.shutdown();assert.equal(path.dirname(await fs.realpath(project)),base);await fs.rm(project,{recursive:true,force:true});});
  return {ctx,root,run,approvals:()=>approvals};
}

test('2 GiB ceiling accepts the boundary and refuses even one extra byte',async t=>{
  const f=await fixture(t);assert.equal(configSchema.parse({...f.ctx.config,maxReadBytes:MAX_FILE_BYTES}).maxReadBytes,2147483648);
  assert.throws(()=>configSchema.parse({...f.ctx.config,maxReadBytes:MAX_FILE_BYTES+1}));
  const source=path.join(f.root,'boundary.bin'),destination=path.join(f.root,'copy.bin');
  const h=await fs.open(source,'wx');try{await h.truncate(MAX_FILE_BYTES+1);}finally{await h.close();}
  await assert.rejects(()=>f.run('filesystem_copy',{source,destination}),/size limit/);
  await assert.rejects(()=>f.ctx.backup(source),/file size limit/);
  await fs.truncate(source,MAX_FILE_BYTES);
  const preview=await f.run('filesystem_copy',{source,destination});
  assert.equal(preview.dryRun,true);assert.equal(preview.bytes,MAX_FILE_BYTES);assert.match(preview.sha256,/^[a-f0-9]{64}$/);
  await assert.rejects(()=>fs.stat(destination));assert.equal(f.approvals(),0);
});

test('large UTF-8 reads retain bounded output, hash all bytes and detect binary data beyond the prefix',async t=>{
  const f=await fixture(t),filename=path.join(f.root,'large.txt');const chunk=Buffer.from('தமிழ் text\n'.repeat(10000));
  const handle=await fs.open(filename,'wx'),hash=createHash('sha256');try{for(let i=0;i<200;i++){await handle.writeFile(chunk);hash.update(chunk);}}finally{await handle.close();}
  const result=await f.run('filesystem_read',{path:filename});assert.equal(result.text.length,MAX_EXTRACTED_TEXT_CHARACTERS);assert.equal(result.truncated,true);assert.match(result.text,/தமிழ் text/);assert.equal(result.sha256,hash.digest('hex'));
  await fs.appendFile(filename,Buffer.from([0]));await assert.rejects(()=>f.run('filesystem_read',{path:filename}),/Binary content/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>hashFile(filename,MAX_FILE_BYTES,controller.signal));
  await assert.rejects(()=>readTextPrefix(filename,1024,100),/size limit/);
});

test('backup and atomic restore exceed the former 100 MB cap and reject a changed backup',async t=>{
  const f=await fixture(t),source=path.join(f.root,'large.bin'),restored=path.join(f.root,'restored.bin');
  const size=101*1024*1024;const h=await fs.open(source,'wx');try{await h.truncate(size);await h.write(Buffer.from('original'),0,8,size-8);}finally{await h.close();}
  const saved=await f.run('filesystem_backup',{path:source,dryRun:false});assert.equal((await fs.stat(saved.backup)).size,size);
  const result=await f.run('filesystem_restore',{backupPath:saved.backup,destination:restored,dryRun:false});assert.equal((await fs.stat(restored)).size,size);
  assert.equal(result.sha256,await hashFile(source,MAX_FILE_BYTES));assert.equal(await hashFile(restored,MAX_FILE_BYTES),result.sha256);assert.equal(f.approvals(),1);
  const tool=filesystemTools(f.ctx).find(x=>x.name==='filesystem_restore')!;const changed=path.join(f.root,'changed.bin');
  await assert.rejects(()=>tool.execute(tool.schema.parse({backupPath:saved.backup,destination:changed,dryRun:false}),{signal:new AbortController().signal,confirm:async()=>{await fs.appendFile(saved.backup,'changed');}}),/Backup changed/);
  await assert.rejects(()=>fs.stat(changed));assert.ok(!(await fs.readdir(f.root)).some(n=>n.startsWith('.wlcmcp-')));
});
