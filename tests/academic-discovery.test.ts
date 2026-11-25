import{test,before,after}from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import path from'node:path';
import PDFDocument from'pdfkit';
import{defaultConfig}from'../src/config/index.js';
import{createContext}from'../src/server/context.js';
import{discoveryTools}from'../src/academic/discovery/index.js';
import{extractionTools,extractDocument}from'../src/academic/extraction/index.js';
import{fitLsa,fitLsaAsync,embedQuery,cosine}from'../src/academic/discovery/lsa.js';
import type{CallContext}from'../src/server/types.js';
let project:string,folder:string;let ctx:Awaited<ReturnType<typeof createContext>>;
const call:CallContext={signal:new AbortController().signal,async confirm(){throw new Error('No external action expected');}};
const file=(name:string)=>path.join(folder,name);
async function invoke(name:string,input:Record<string,unknown>){const tool=discoveryTools(ctx).find(t=>t.name===name)!;return await tool.execute(tool.schema.parse(input),call)as any;}
before(async()=>{await fs.mkdir('test-results',{recursive:true});project=await fs.mkdtemp(path.resolve('test-results/discovery-'));folder=path.join(project,'workspace');await fs.mkdir(folder);ctx=await createContext(defaultConfig(project),project);await fs.writeFile(file('automobile.txt'),'automobile vehicle road transport engine wheel');await fs.writeFile(file('car.txt'),'car vehicle road transport engine wheel');await fs.writeFile(file('cooking.txt'),'banana fruit recipe food kitchen cooking');});
after(async()=>{await ctx.shutdown();assert.ok(project.startsWith(path.resolve('test-results')+path.sep));await fs.rm(project,{recursive:true,force:true});});
test('index previews then batches with cursor and skips unchanged hashes',async()=>{
 const preview=await invoke('academic_index_build',{limit:1});assert.equal(preview.dryRun,true);assert.equal(preview.files.length,1);const first=await invoke('academic_index_build',{limit:1,dryRun:false});assert.equal(first.indexed,1);assert.ok(first.nextCursor);const rest=await invoke('academic_index_build',{cursor:first.nextCursor,limit:10,dryRun:false});assert.equal(rest.indexed,2);assert.equal(rest.nextCursor,null);const unchanged=await invoke('academic_index_build',{dryRun:false});assert.equal(unchanged.unchanged,3);
});
test('fulltext metadata and citation resolution include actual source hash and location',async()=>{
 const text=await invoke('academic_search',{query:'automobile',mode:'fulltext'});assert.equal(text.results.length,1);assert.equal(path.basename(text.results[0].path),'automobile.txt');const reference=text.results[0];const resolved=await invoke('academic_source_resolve',{sourceId:reference.sourceId,segmentId:reference.segmentId});assert.equal(resolved.sha256,reference.sha256);assert.match(resolved.segment.text,/vehicle/);assert.ok(resolved.segment.location.paragraph);
 const metadata=await invoke('academic_search',{query:'cooking',mode:'metadata'});assert.equal(path.basename(metadata.results[0].path),'cooking.txt');
});
test('real corpus LSA retrieves a related document without the exact query term',async()=>{
 const model=fitLsa([{id:'auto',text:'automobile vehicle road transport engine wheel'},{id:'car',text:'car vehicle road transport engine wheel'},{id:'fruit',text:'banana fruit recipe food kitchen cooking'}],2,'fixture');assert.equal(model.method,'corpus_lsa_tfidf_truncated_svd');const query=embedQuery(model,'car');const auto=cosine(query.vector,model.vectors.find(v=>v.id==='auto')!.values);const fruit=cosine(query.vector,model.vectors.find(v=>v.id==='fruit')!.values);assert.ok(auto>.5&&auto>fruit+.4,JSON.stringify({auto,fruit}));
 await invoke('academic_index_semantic_fit',{dimensions:2,dryRun:false});const lexical=await invoke('academic_search',{query:'car',mode:'fulltext'});assert.ok(!lexical.results.some((r:any)=>path.basename(r.path)==='automobile.txt'));const semantic=await invoke('academic_search',{query:'car',mode:'semantic'});assert.ok(semantic.results.some((r:any)=>path.basename(r.path)==='automobile.txt'&&r.methods.includes('corpus_lsa')));assert.equal((await invoke('academic_search',{query:'unseenvocabularyxyz',mode:'semantic'})).results.length,0);
});
test('index survives process context restart and still validates current sources',async()=>{
 await ctx.shutdown();ctx=await createContext(defaultConfig(project),project);const search=await invoke('academic_search',{query:'car',mode:'semantic'});assert.ok(search.results.length>=2);const status=await invoke('academic_index_status',{});assert.equal(status.semantic.method,'corpus_lsa_tfidf_truncated_svd');assert.equal(status.sources.count,3);
});
test('LSA worker training leaves the event loop responsive and cancels without committing a model',async()=>{
 const docs=Array.from({length:800},(_,i)=>({id:String(i),text:Array.from({length:120},(_,j)=>'term'+((i*17+j*13)%600)).join(' ')}));const controller=new AbortController();let timerRan=false;const timer=setTimeout(()=>{timerRan=true;controller.abort();},20);try{await assert.rejects(()=>fitLsaAsync(docs,24,'cancellation-fixture',{signal:controller.signal,timeoutMs:5000}),/cancelled/);assert.equal(timerRan,true);}finally{clearTimeout(timer);}
});
test('source edits and removals withhold stale citations until a fresh index',async()=>{
 const result=await invoke('academic_search',{query:'automobile',mode:'fulltext'});const reference=result.results[0];await fs.writeFile(file('automobile.txt'),'A newly edited assignment about mathematics');const stale=await invoke('academic_search',{query:'automobile',mode:'fulltext'});assert.equal(stale.results.length,0);assert.ok(stale.staleResultsWithheld>0);await assert.rejects(()=>invoke('academic_source_resolve',{sourceId:reference.sourceId,segmentId:reference.segmentId}),/stale/);await assert.rejects(()=>invoke('academic_search',{query:'car',mode:'semantic'}),/stale/);await assert.rejects(()=>invoke('academic_index_semantic_fit',{dryRun:false}),/stale/);
 const refresh=await invoke('academic_index_build',{dryRun:false});assert.equal(refresh.indexed,1);await assert.rejects(()=>invoke('academic_search',{query:'car',mode:'semantic'}),/No LSA model/);await fs.unlink(file('cooking.txt'));const removed=await invoke('academic_index_build',{dryRun:false});assert.ok(removed.revoked>=1);assert.equal((await invoke('academic_search',{query:'banana',mode:'fulltext'})).results.length,0);
});
test('index database and SQLite sidecars reject symbolic-link aliases',async t=>{
 const state=path.join(project,'.state','academic');const target=file('sidecar-target.txt');await fs.writeFile(target,'preserve');for(const suffix of ['-journal','-wal','-shm']){const alias=path.join(state,'index.sqlite'+suffix);try{await fs.symlink(target,alias,'file');}catch(e:any){if(e.code==='EPERM')return t.skip('Windows file-symlink privilege unavailable; no elevation or developer-mode change requested');throw e;}try{await assert.rejects(()=>invoke('academic_index_status',{}),/Unsafe academic (?:index|database)/);assert.equal(await fs.readFile(target,'utf8'),'preserve');}finally{await fs.unlink(alias);}}
});
test('revoked roots never return indexed text or resolved citations',async()=>{
 const result=await invoke('academic_search',{query:'mathematics',mode:'fulltext'});const reference=result.results[0];const original=ctx.paths.check;ctx.paths.check=async()=>{throw new Error('Root was revoked');};try{assert.equal((await invoke('academic_search',{query:'mathematics',mode:'fulltext'})).results.length,0);await assert.rejects(()=>invoke('academic_source_resolve',{sourceId:reference.sourceId,segmentId:reference.segmentId}),/no longer authorized/);}finally{ctx.paths.check=original;}
});
test('actual scanned PDF OCR becomes canonical indexed citation evidence and replacement/revocation invalidates it',{skip:process.platform!=='win32'},async()=>{
 const extract=async(name:string,input:Record<string,unknown>)=>{const tool=extractionTools(ctx).find(t=>t.name===name)!;return await tool.execute(tool.schema.parse(input),call)as any;};
 const pdf=(image?:Buffer)=>{const chunks:Buffer[]=[];const doc=new PDFDocument();const result=new Promise<Buffer>(resolve=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));});if(image)doc.image(image,0,0,{width:612,height:792});else doc.fontSize(30).text('PHOTOSYNTHESIS LAB 42',60,90);doc.end();return result;};
 await fs.writeFile(file('raster-input.pdf'),await pdf());const media=await extract('academic_document_page_view',{path:file('raster-input.pdf'),page:1,width:1400});const source=file('scan-ocr.pdf');await fs.writeFile(source,await pdf(Buffer.from(media.images[0].data,'base64')));await fs.unlink(file('raster-input.pdf'));
 await invoke('academic_index_build',{dryRun:false});const metadata=await invoke('academic_search',{query:'scan-ocr',mode:'metadata'});const empty=metadata.results.find((r:any)=>r.path===source);assert.ok(empty);assert.equal(empty.segmentId,null);assert.equal(empty.citationReady,false);assert.equal(empty.needsOCR,true);assert.equal((await invoke('academic_search',{query:'photosynthesis',mode:'fulltext'})).results.length,0);
 const originalProject=ctx.projectDir;ctx.projectDir=path.resolve('.');let first:any;
 try{first=await extract('academic_pdf_ocr',{path:source,page:1,width:1400,imagePath:file('scan-working1.png'),dryRun:false});assert.match(first.text,/PHOTOSYNTHESIS LAB 42/i);assert.equal(first.cached,true);assert.equal(first.indexInvalidated,true);const update=await invoke('academic_index_build',{dryRun:false});assert.equal(update.indexed,1);const hit=(await invoke('academic_search',{query:'photosynthesis',mode:'fulltext'})).results[0];assert.equal(hit.sourceId,first.sourceId);assert.equal(hit.segmentId,first.segmentId);const resolved=await invoke('academic_source_resolve',{sourceId:hit.sourceId,segmentId:hit.segmentId});assert.match(resolved.segment.text,/PHOTOSYNTHESIS/);assert.equal(resolved.segment.location.page,1);
  // Different actual render provenance is a new canonical extraction even when PDF bytes stay identical.
  const second=await extract('academic_pdf_ocr',{path:source,page:1,width:1000,imagePath:file('scan-working2.png'),dryRun:false});assert.equal(second.sourceSha256,first.sourceSha256);assert.notEqual(second.sourceId,first.sourceId);await assert.rejects(()=>invoke('academic_source_resolve',{sourceId:first.sourceId,segmentId:first.segmentId}),/stale/);assert.equal((await invoke('academic_index_build',{dryRun:false})).indexed,1);
  // Reopening state preserves actual OCR, and canonical source checks continue to apply.
  await ctx.shutdown();ctx=await createContext(defaultConfig(project),project);ctx.projectDir=path.resolve('.');assert.equal((await extractDocument(ctx,source,call)).sourceId,second.sourceId);
  const check=ctx.paths.check;ctx.paths.check=async(input,mode)=>{if(path.resolve(input).toLowerCase()===source.toLowerCase())throw new Error('Root revoked fixture');return check.call(ctx.paths,input,mode);};try{await assert.rejects(()=>extractDocument(ctx,source,call),/revoked/);assert.equal((await invoke('academic_search',{query:'scan-ocr',mode:'metadata'})).results.length,0);}finally{ctx.paths.check=check;}
  assert.ok(!(await extractDocument(ctx,source,call)).segments.some(s=>s.kind==='ocr'),'Revoked cached OCR must not silently resurrect after access returns.');
  const third=await extract('academic_pdf_ocr',{path:source,page:1,width:1400,imagePath:file('scan-working3.png'),dryRun:false});await fs.appendFile(source,'\n% source version changed\n');const changed=await extractDocument(ctx,source,call);assert.notEqual(changed.sha256,third.sourceSha256);assert.ok(!changed.segments.some(s=>s.kind==='ocr'));await invoke('academic_index_build',{dryRun:false});assert.equal((await invoke('academic_search',{query:'photosynthesis',mode:'fulltext'})).results.length,0);
 }finally{ctx.projectDir=originalProject;}
});
test('metadata discovery returns an empty source with no invented citation segment',async()=>{
 const source=file('empty-source.md');await fs.writeFile(source,'');await invoke('academic_index_build',{roots:[source],dryRun:false});const result=await invoke('academic_search',{query:'empty-source',mode:'metadata'});const hit=result.results.find((r:any)=>r.path===source);assert.ok(hit);assert.equal(hit.segmentId,null);assert.equal(hit.citationReady,false);assert.equal(hit.needsOCR,false);assert.equal(hit.excerpt,'');
});
