import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { AppContext, CallContext } from '../src/server/types.js';
import { filesystemTools } from '../src/filesystem/index.js';
import { renderReport, readDocument, reportFormats } from '../src/filesystem/documents.js';

let base:string;let root:string;let state:string;let ctx:AppContext;
let confirmCount=0;let recycleCount=0;
const call:CallContext={signal:new AbortController().signal,async confirm(){confirmCount++;}};
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const file=(name:string)=>path.join(root,name);
async function invoke(name:string,input:Record<string,unknown>,context=call) {
  const tool=filesystemTools(ctx).find(item=>item.name===name)!;
  return await tool.execute(tool.schema.parse(input),context) as any;
}
before(async()=>{
  await fs.mkdir('test-results',{recursive:true});
  base=await fs.mkdtemp(path.resolve('test-results/filesystem-'));
  root=path.join(base,'authorized');state=path.join(base,'state');
  await fs.mkdir(root);await fs.mkdir(path.join(state,'backups'),{recursive:true});
  ctx={config:{version:1,authorizedRoots:[root],stateDir:state,maxReadBytes:8*1024*1024,maxSearchEntries:500,toolTimeoutMs:10000,applications:{},desktop:{enabled:false,allowedProcesses:[],presenceMaxIdleSeconds:120},browser:{enabled:false,allowedOrigins:[],headless:true},commands:{},databases:{}},projectDir:base,
    paths:{async check(value){const resolved=path.resolve(value);const relative=path.relative(root,resolved);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Access denied outside authorized root.');let part=root;for(const segment of relative.split(path.sep).filter(Boolean)){part=path.join(part,segment);try{if((await fs.lstat(part)).isSymbolicLink())throw new Error('Link denied.');}catch(error:any){if(error.code!=='ENOENT')throw error;}}return resolved;},isRoot(value){return path.resolve(value)===root;}},
    async backup(filename){const dest=path.join(state,'backups',randomUUID()+'.bak');await fs.copyFile(filename,dest);return dest;},
    async runPowerShell(operation,payload){assert.equal(operation,'recycle');recycleCount++;await fs.rename(payload.path as string,path.join(base,'recycled-'+randomUUID()));return {recycled:true};},
    async runProcess(){throw new Error('Unexpected process execution.');},audit:{record(){},list(){return[];}},emergency:{assertRunning(){},async stop(){},onStop(){}}
  };
});
after(async()=>{if(base){const resolved=path.resolve(base);assert.ok(resolved.startsWith(path.resolve('test-results')+path.sep));await fs.rm(resolved,{recursive:true,force:true});}});

test('filesystem schemas reject malformed and unexpected arguments',()=>{
  for(const tool of filesystemTools(ctx))assert.throws(()=>tool.schema.parse({unexpected:true}),tool.name);
  const edit=filesystemTools(ctx).find(tool=>tool.name==='filesystem_edit')!;
  assert.throws(()=>edit.schema.parse({path:file('a.txt'),content:'x',expectedSha256:'fake'}));
});
test('authorized roots and directory browsing/search are real and bounded',async()=>{
  await fs.mkdir(file('browse'));await fs.writeFile(file('browse/Example.ts'),'hello needle');await fs.writeFile(file('browse/other.md'),'notes');
  assert.deepEqual((await invoke('filesystem_roots',{})).roots,[root]);
  const list=await invoke('filesystem_list',{path:file('browse')});assert.equal(list.entries.length,2);
  const search=await invoke('filesystem_search',{path:root,name:'example',extensions:['ts']});assert.equal(search.entries.length,1);
  const content=await invoke('filesystem_search_content',{path:file('browse'),query:'NEEDLE'});assert.equal(content.matches.length,1);assert.match(content.matches[0].excerpt,/needle/);
  await assert.rejects(()=>invoke('filesystem_list',{path:base}),/Access denied/);
});
test('create defaults to dry run and refuses overwrite',async()=>{
  const filename=file('create.txt');assert.equal((await invoke('filesystem_create',{path:filename,content:'first'})).dryRun,true);
  await assert.rejects(()=>fs.stat(filename));
  await invoke('filesystem_create',{path:filename,content:'first',dryRun:false});assert.equal(await fs.readFile(filename,'utf8'),'first');
  await assert.rejects(()=>invoke('filesystem_create',{path:filename,content:'second',dryRun:false}),/already exists/);
  await invoke('filesystem_create',{path:file('newdir'),kind:'directory',dryRun:false});assert.ok((await fs.stat(file('newdir'))).isDirectory());
});
test('edit requires correct source hash, confirms, and backs up original',async()=>{
  const filename=file('edit.ts');await fs.writeFile(filename,'const a = 1;');
  await assert.rejects(()=>invoke('filesystem_edit',{path:filename,content:'new',expectedSha256:'0'.repeat(64),dryRun:false}),/SHA-256 mismatch/);
  const source=await invoke('filesystem_read',{path:filename});const before=confirmCount;
  const changed=await invoke('filesystem_edit',{path:filename,content:'const a = 2;',expectedSha256:source.sha256,dryRun:false});
  assert.equal(confirmCount,before+1);assert.equal(await fs.readFile(changed.backup,'utf8'),'const a = 1;');assert.equal(await fs.readFile(filename,'utf8'),'const a = 2;');
});
test('rejected approval and concurrent edit leave source safe',async()=>{
  const filename=file('race.txt');await fs.writeFile(filename,'original');
  await assert.rejects(()=>invoke('filesystem_edit',{path:filename,content:'replace',expectedSha256:digest('original'),dryRun:false},{...call,async confirm(){throw new Error('Declined');}}),/Declined/);
  assert.equal(await fs.readFile(filename,'utf8'),'original');
  await assert.rejects(()=>invoke('filesystem_edit',{path:filename,content:'replace',expectedSha256:digest('original'),dryRun:false},{...call,async confirm(){await fs.writeFile(filename,'concurrent');}}),/changed after/);
  assert.equal(await fs.readFile(filename,'utf8'),'concurrent');
});
test('copy move rename and compare operate on single authorized files',async()=>{
  const source=file('source.py');await fs.writeFile(source,'print(1)\n');
  await invoke('filesystem_copy',{source,destination:file('copy.py'),dryRun:false});
  assert.equal((await invoke('filesystem_compare',{left:source,right:file('copy.py')})).equal,true);
  await invoke('filesystem_move',{source:file('copy.py'),destination:file('moved.py'),dryRun:false});await assert.rejects(()=>fs.stat(file('copy.py')));
  await invoke('filesystem_rename',{source:file('moved.py'),destination:file('renamed.py'),dryRun:false});assert.equal(await fs.readFile(file('renamed.py'),'utf8'),'print(1)\n');
  await assert.rejects(()=>invoke('filesystem_copy',{source:root,destination:file('tree'),dryRun:false}),/regular file/);
});
test('organize previews, moves explicit mappings, and rejects collisions before mutations',async()=>{
  await fs.writeFile(file('org1.txt'),'one');await fs.writeFile(file('org2.txt'),'two');
  const moves=[{source:file('org1.txt'),destination:file('newdir/one.txt')},{source:file('org2.txt'),destination:file('newdir/two.txt')}];
  assert.equal((await invoke('filesystem_organize',{moves})).dryRun,true);assert.equal(await fs.readFile(file('org1.txt'),'utf8'),'one');
  await invoke('filesystem_organize',{moves,dryRun:false});assert.equal(await fs.readFile(file('newdir/two.txt'),'utf8'),'two');
  await fs.writeFile(file('collision.txt'),'safe');await assert.rejects(()=>invoke('filesystem_organize',{moves:[{source:file('collision.txt'),destination:file('newdir/two.txt')}],dryRun:false}),/already exists/);assert.equal(await fs.readFile(file('collision.txt'),'utf8'),'safe');
});
test('recycle is single-file, confirmed, and backed up',async()=>{
  const filename=file('recycle.txt');await fs.writeFile(filename,'recover me');
  await invoke('filesystem_delete',{path:filename});assert.equal(recycleCount,0);
  const before=confirmCount;const result=await invoke('filesystem_delete',{path:filename,dryRun:false});assert.equal(recycleCount,1);assert.equal(confirmCount,before+1);assert.equal(await fs.readFile(result.backup,'utf8'),'recover me');await assert.rejects(()=>fs.stat(filename));
  await assert.rejects(()=>invoke('filesystem_delete',{path:root,dryRun:false}),/roots/);
});
test('backup and restore round trip, reject arbitrary sources and sidecars',async()=>{
  const filename=file('backup.txt');await fs.writeFile(filename,'saved');const result=await invoke('filesystem_backup',{path:filename,dryRun:false});
  await fs.writeFile(filename,'changed');await invoke('filesystem_restore',{backupPath:result.backup,destination:filename,dryRun:false});assert.equal(await fs.readFile(filename,'utf8'),'saved');
  await assert.rejects(()=>invoke('filesystem_restore',{backupPath:file('source.py'),destination:file('illegal.txt'),dryRun:false}),/backup store/);
  await fs.writeFile(result.backup+'.json','{}');await assert.rejects(()=>invoke('filesystem_restore',{backupPath:result.backup+'.json',destination:file('illegal.txt'),dryRun:false}),/backup store/);
});
test('hard links cannot be mutated through an authorized alias',async()=>{
  await fs.writeFile(path.join(base,'outside.txt'),'protected');await fs.link(path.join(base,'outside.txt'),file('hardlink.txt'));
  await assert.rejects(()=>invoke('filesystem_edit',{path:file('hardlink.txt'),content:'bad',expectedSha256:digest('protected'),dryRun:false}),/Hard-linked/);
  assert.equal(await fs.readFile(path.join(base,'outside.txt'),'utf8'),'protected');
});
test('already aborted writes do not create output',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>invoke('filesystem_create',{path:file('aborted.txt'),content:'bad',dryRun:false},{...call,signal:controller.signal}));await assert.rejects(()=>fs.stat(file('aborted.txt')));
});
test('all report formats generate real parseable documents and protect active content',async()=>{
  const report={title:'Fixture report',columns:['Item','Count'],rows:[['plain & safe',42],['=HYPERLINK("bad")',true]]};
  for(const format of reportFormats){
    const filename=file(`report.${format}`);const preview=await invoke('filesystem_report',{path:filename,format,report});assert.equal(preview.dryRun,true);
    const result=await invoke('filesystem_report',{path:filename,format,report,dryRun:false});assert.ok(result.bytes>50,format);
    if(['pdf','docx','xlsx','pptx'].includes(format)){const extracted=await readDocument(filename,ctx.config.maxReadBytes);assert.match(extracted.text,/Fixture report/,format);assert.match(extracted.text,/plain & safe/,format);}
  }
  const csv=await fs.readFile(file('report.csv'),'utf8');assert.match(csv,/'=HYPERLINK/);
  const html=await renderReport('html',{title:'<script>',columns:['&'],rows:[['<img src=x onerror=alert(1)>']]});assert.ok(!html.toString().includes('<img'));assert.match(html.toString(),/&lt;script&gt;/);
  await assert.rejects(()=>invoke('filesystem_report',{path:file('malformed.csv'),format:'csv',report:{title:'x',columns:['one'],rows:[['two','cells']]},dryRun:false}),/column count/);
});
