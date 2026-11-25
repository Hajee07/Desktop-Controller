import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {defaultConfig} from '../src/config/index.js';
import {createContext} from '../src/server/context.js';
import {filesystemTools} from '../src/filesystem/index.js';
import {extractDocument} from '../src/academic/extraction/index.js';
import {discoveryTools} from '../src/academic/discovery/index.js';
import {MAX_EXTRACTED_TEXT_CHARACTERS} from '../src/utils/text-limits.js';
import type {CallContext} from '../src/server/types.js';

const call:CallContext={signal:new AbortController().signal,confirm:async()=>{throw new Error('No protected operation expected');}};
async function fixture(t:any){
  const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});const project=await fs.mkdtemp(path.join(base,'text-limit-'));const root=path.join(project,'workspace');await fs.mkdir(root);
  const ctx=await createContext(defaultConfig(project),project);t.after(async()=>{await ctx.shutdown();assert.equal(path.dirname(await fs.realpath(project)),base);await fs.rm(project,{recursive:true,force:true});});
  const run=async(name:string,args:any)=>{const tool=[...filesystemTools(ctx),...discoveryTools(ctx)].find(t=>t.name===name)!;return await tool.execute(tool.schema.parse(args),call)as any;};return{root,project,ctx,run};
}

test('filesystem text budget is exactly 10x and reports truncation only above the new boundary',async t=>{
  const f=await fixture(t),source=path.join(f.root,'boundary.txt');assert.equal(MAX_EXTRACTED_TEXT_CHARACTERS,250000*10);
  const full='A'.repeat(MAX_EXTRACTED_TEXT_CHARACTERS);await fs.writeFile(source,full);
  const exact=await f.run('filesystem_read',{path:source});assert.equal(exact.text.length,2500000);assert.equal(exact.truncated,false);
  await fs.appendFile(source,'B');const excess=await f.run('filesystem_read',{path:source});assert.equal(excess.text,full);assert.equal(excess.truncated,true);
  assert.equal(excess.sha256,createHash('sha256').update(full+'B').digest('hex'));
  const right=path.join(f.root,'other.txt');await fs.writeFile(source,'A'.repeat(300000)+'\nleft');await fs.writeFile(right,'A'.repeat(300000)+'\nright');
  const compared=await f.run('filesystem_compare',{left:source,right});assert.equal(compared.textComparisonTruncated,false);assert.equal(compared.firstDifferingLine,2);
});

test('structured DOCX extraction retains text beyond the old limit and caps the aggregate at 2.5 million',async t=>{
  const f=await fixture(t),source=path.join(f.root,'boundary.docx');const zip=new JSZip();
  const paragraph='<w:p><w:r><w:t>'+'X'.repeat(10000)+'</w:t></w:r></w:p>';
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paragraph.repeat(251)+'</w:body></w:document>');
  await fs.writeFile(source,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));const doc=await extractDocument(f.ctx,source,call);
  assert.equal(doc.segments.reduce((n,s)=>n+s.text.length,0),2500000);assert.equal(doc.segments.length,250);assert.ok(doc.warnings.includes('Structured extraction reached the text/segment limit.'));
});

test('old shorter extraction indexes are withheld and reindexed without changing source files',async t=>{
  const f=await fixture(t),source=path.join(f.root,'long.txt');const content=('A'.repeat(100)+'\n').repeat(3000)+'TAILMARKER_AFTER_OLD_LIMIT';await fs.writeFile(source,content);
  assert.equal((await f.run('academic_index_build',{roots:[source],dryRun:false})).indexed,1);
  const hash=createHash('sha256').update(content).digest('hex'),legacy='src_'+createHash('sha256').update(source.toLowerCase()+'\0'+hash).digest('hex').slice(0,24);
  const db=new DatabaseSync(path.join(f.ctx.config.stateDir,'academic','index.sqlite'));
  try{const row=db.prepare('SELECT id FROM sources WHERE path=? AND active=1').get(source)as {id:string};assert.notEqual(row.id,legacy);db.prepare('UPDATE sources SET id=? WHERE id=?').run(legacy,row.id);db.prepare('UPDATE chunks SET source_id=? WHERE source_id=?').run(legacy,row.id);db.prepare('UPDATE chunks_fts SET source_id=? WHERE source_id=?').run(legacy,row.id);}finally{db.close();}
  const stale=await f.run('academic_search',{query:'TAILMARKER_AFTER_OLD_LIMIT',mode:'fulltext'});assert.equal(stale.results.length,0);assert.ok(stale.staleResultsWithheld>0);
  assert.equal((await f.run('academic_index_build',{roots:[source],dryRun:false})).indexed,1);assert.ok((await f.run('academic_search',{query:'TAILMARKER_AFTER_OLD_LIMIT',mode:'fulltext'})).results.length>0);assert.equal(await fs.readFile(source,'utf8'),content);
});
