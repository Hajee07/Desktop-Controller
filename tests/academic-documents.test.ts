import{test,before,after}from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import path from'node:path';
import JSZip from'jszip';
import{defaultConfig}from'../src/config/index.js';
import{createContext}from'../src/server/context.js';
import{documentTools}from'../src/academic/documents/index.js';
import{presentationTools}from'../src/academic/presentations/index.js';
import{extractDocument}from'../src/academic/extraction/index.js';
import{checkedFile}from'../src/academic/common.js';
import type{CallContext}from'../src/server/types.js';
let project:string,folder:string;let ctx:Awaited<ReturnType<typeof createContext>>;const file=(name:string)=>path.join(folder,name);const call:CallContext={signal:new AbortController().signal,async confirm(){throw new Error('No native dialog expected');}};
async function invoke(name:string,input:Record<string,unknown>){const tool=[...documentTools(ctx),...presentationTools(ctx)].find(t=>t.name===name)!;return await tool.execute(tool.schema.parse(input),call)as any;}
before(async()=>{await fs.mkdir('test-results',{recursive:true});project=await fs.mkdtemp(path.resolve('test-results/academic-documents-'));folder=path.join(project,'workspace');await fs.mkdir(folder);ctx=await createContext(defaultConfig(project),project);});
after(async()=>{await ctx.shutdown();assert.ok(project.startsWith(path.resolve('test-results')+path.sep));await fs.rm(project,{recursive:true,force:true});});
test('rich DOCX generation writes actual structured content and quality reports needs-review honestly',async()=>{
 const input={path:file('assignment.docx'),title:'Synthetic assignment report',style:{font:'Arial',fontSizePt:11,lineSpacing:1.2,marginCm:2},header:'Course laboratory',tableOfContents:true,sections:[{heading:'Question 1',questionId:'Q1',paragraphs:[{text:'Original independent explanation.',bold:true}],table:{columns:['Observation','Value'],rows:[['Supplied measurement','12.3']],caption:'Table 1: Supplied observations'}},{heading:'Implementation',code:{language:'C',text:'int main() {\n  return 0;\n}'},equation:{text:'ratio',numerator:'distance',denominator:'time'}}],references:[{title:'Supplied lecture notes',locator:'page 2'}]};
 assert.equal((await invoke('academic_document_compose',input)).dryRun,true);await assert.rejects(()=>fs.stat(input.path));const created=await invoke('academic_document_compose',{...input,dryRun:false});assert.ok(created.bytes>1000);const source=await extractDocument(ctx,input.path,call);assert.ok(source.segments.some(s=>s.text==='Question 1'));assert.ok(source.segments.some(s=>s.kind==='code'));assert.ok(source.segments.some(s=>s.kind==='equation'));assert.ok(source.segments.some(s=>s.kind==='header'));assert.equal(source.tables.length,1);assert.ok((source.metadata.fields as any[]).some(s=>String(s).includes('TOC')));
 const quality=await invoke('academic_document_quality',{path:input.path,requiredText:['Question 1','Original independent explanation.','Supplied lecture notes']});assert.equal(quality.machineChecksPassed,true);assert.equal(quality.visualReview,'needs_review');assert.equal(quality.academicAccuracy,'needs_review');await assert.rejects(()=>invoke('academic_document_compose',{...input,dryRun:false}),/exist/i);
});
test('measured and saved style profiles preserve source and current overrides win',async()=>{
 const source=await checkedFile(ctx,file('assignment.docx'));const measured=await invoke('academic_style_analyse',{path:source.path});assert.equal(measured.style.font,'Arial');assert.equal(measured.style.fontSizePt,11);assert.ok(Math.abs(measured.style.marginCm-2)<.01);
 const saved=await invoke('academic_style_save',{path:source.path,label:'Synthetic course template',dryRun:false});assert.match(saved.id,/^[a-f0-9-]{36}$/);assert.ok((await invoke('academic_style_list',{})).profiles.some((p:any)=>p.id===saved.id));
 await invoke('academic_document_compose',{path:file('matched.docx'),title:'New work',profileId:saved.id,style:{fontSizePt:13},sections:[{heading:'Question 2',paragraphs:[{text:'Current instructions override previous size.'}]}],dryRun:false});const matched=await invoke('academic_style_analyse',{path:file('matched.docx')});assert.equal(matched.style.font,'Arial');assert.equal(matched.style.fontSizePt,13);assert.equal((await checkedFile(ctx,source.path)).sha256,source.sha256);
});
test('patch makes a new copy while preserving all other template parts exactly',async()=>{
 const original=await checkedFile(ctx,file('assignment.docx'));const patched=await invoke('academic_document_patch',{source:original.path,path:file('patched.docx'),expectedSha256:original.sha256,replacements:[{find:'Original independent explanation.',replace:'A revised independently checked explanation.'}],dryRun:false});const oldZip=await JSZip.loadAsync(original.buffer),newZip=await JSZip.loadAsync(await fs.readFile(patched.path));for(const name of Object.keys(oldZip.files)){if(oldZip.files[name].dir||name==='word/document.xml')continue;assert.deepEqual(await newZip.file(name)!.async('nodebuffer'),await oldZip.file(name)!.async('nodebuffer'),name);}assert.equal((await checkedFile(ctx,original.path)).sha256,original.sha256);assert.ok((await extractDocument(ctx,patched.path,call)).segments.some(s=>s.text.includes('revised independently')));
 await assert.rejects(()=>invoke('academic_document_patch',{source:original.path,path:file('bad.docx'),expectedSha256:'0'.repeat(64),replacements:[{find:'Original',replace:'Bad'}],dryRun:false}),/hash changed/);
 await assert.rejects(()=>invoke('academic_document_patch',{source:original.path,path:original.path,expectedSha256:original.sha256,replacements:[{find:'Original',replace:'Bad'}],dryRun:false}),/cannot be overwritten/);
});
test('patch refuses duplicate matches within the same text run',async()=>{
 await invoke('academic_document_compose',{path:file('ambiguous.docx'),title:'Ambiguous fixture',sections:[{paragraphs:[{text:'REPEAT REPEAT'}]}],dryRun:false});const original=await checkedFile(ctx,file('ambiguous.docx'));await assert.rejects(()=>invoke('academic_document_patch',{source:original.path,path:file('ambiguous-copy.docx'),expectedSha256:original.sha256,replacements:[{find:'REPEAT',replace:'Once'}],dryRun:false}),/exactly one|ambig/i);
});
test('direct PDF and academic PowerPoint contain supplied content without original overwrite',async()=>{
 await invoke('academic_pdf_generate',{path:file('plain.pdf'),title:'Verification fixture',sections:[{heading:'Q1',paragraphs:[{text:'All numbers came from supplied observations.'}]}],dryRun:false});const pdf=await extractDocument(ctx,file('plain.pdf'),call);assert.ok(pdf.segments.some(s=>s.text.includes('supplied observations')));
 await invoke('academic_presentation_generate',{path:file('slides.pptx'),title:'Lecture review',slides:[{title:'Evidence',bullets:['Use supplied data','Verify references'],notes:'Discussion notes'},{title:'Results',table:{columns:['Name','Value'],rows:[['Measured','12.3']]}}],dryRun:false});const slides=await extractDocument(ctx,file('slides.pptx'),call);assert.equal(slides.metadata.slideCount,2);assert.ok(slides.segments.some(s=>s.kind==='speaker-notes'&&s.text.includes('Discussion notes')));assert.ok(slides.tables.length);await assert.rejects(()=>invoke('academic_presentation_generate',{path:file('slides.pptx'),title:'Replacement',slides:[{title:'Oops'}],dryRun:false}),/exist/i);
});
test('presentation layout refuses overlapping table and bullet body content',async()=>{
 await assert.rejects(()=>invoke('academic_presentation_generate',{path:file('overlap.pptx'),title:'Layout fixture',slides:[{title:'Body',bullets:['A bullet'],table:{columns:['Col'],rows:[['Cell']]}}],dryRun:false}),/table|bullet|layout|content/i);
});
