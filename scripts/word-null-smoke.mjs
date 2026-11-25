// Real native Word integration, using only a generated disposable document.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Document,Paragraph,Packer,TextRun,HeadingLevel,Table,TableRow,TableCell} from 'docx';
import JSZip from 'jszip';
import {defaultConfig} from '../dist/config/index.js';
import {createContext} from '../dist/server/context.js';
import {officeTools} from '../dist/office/index.js';

const project=path.resolve(import.meta.dirname,'..');
const root=await fs.mkdtemp(path.join(project,'test-results','word-null-live-'));
const file=path.join(root,'Generated null regression.docx');
const config=defaultConfig(project);
config.authorizedRoots=[root];config.stateDir=path.join(root,'.state');
config.permissions={automaticWorkspaceEdits:true,automaticWordRoots:[root]};
await fs.writeFile(file,await Packer.toBuffer(new Document({sections:[{children:[
 new Paragraph({text:'1. Fixture heading',heading:HeadingLevel.HEADING_1}),
 new Paragraph({children:[new TextRun('Fixture editable sentence.'),new TextRun({text:' Emphasis.',italics:true})]}),
 new Paragraph(''),
 new Table({rows:[new TableRow({children:[new TableCell({children:[new Paragraph('Cell one')]}),new TableCell({children:[new Paragraph('Cell two')]})]})]}),
 new Paragraph('Fixture final paragraph.')
]}]})));
const ctx=await createContext(config,project),tools=officeTools(ctx);
const run=async(name,input)=>{
 const tool=tools.find(t=>t.name===name);assert.ok(tool,name);
 return tool.execute(tool.schema.parse(input),{signal:AbortSignal.timeout(90000),confirm:async()=>{throw new Error('Unexpected fixture approval');}});
};
const passed=[];
let opened=false;
try {
 const originalHash=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const info=await run('word_open',{path:file,dryRun:false});opened=true;
 const target={path:file,documentId:info.documentId};
 let properties=await run('word_get_document_properties',target);
 const rows=await run('word_get_paragraphs',target);
 assert.ok(rows.paragraphs.some(p=>p.text===''));assert.ok(rows.paragraphs.every(p=>p.styleAvailable));passed.push('paragraphs including empty and mixed formatting');
 const headings=await run('word_get_headings',target);assert.equal(headings.headings.length,1);passed.push('headings');
 const tables=await run('word_get_tables',target);assert.equal(tables.tables[0].cells[1].text,'Cell two');passed.push('tables');
 const selection=await run('word_get_selection',target);assert.equal(typeof selection.text,'string');passed.push('selection');
 const refs=await run('word_get_references',target);assert.equal(refs.sourceCount,0);passed.push('empty bibliography');
 const editable=rows.paragraphs.find(p=>p.text.startsWith('Fixture editable'));
 properties=await run('word_get_document_properties',target);
 const section=await run('word_read_section',{...target,start:editable.start,end:editable.end,expectedRevision:properties.revision});assert.match(section.paragraphs[0].text,/Fixture editable/);passed.push('section');
 properties=await run('word_get_document_properties',target);
 const checkpoint=await run('word_create_checkpoint',{...target,expectedRevision:properties.revision});assert.match(await fs.readFile(checkpoint.checkpointPath,'utf8'),/Fixture editable/);passed.push('checkpoint');
 const image=path.join(root,'synthetic-test-image.png');
 await fs.writeFile(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=','base64'));
 properties=await run('word_get_document_properties',target);
 const table=tables.tables[0],last=rows.paragraphs.at(-1);
 const edited=await run('word_edit_batch',{...target,expectedRevision:properties.revision,requestKey:randomUUID(),dryRun:false,operations:[
  {kind:'replace',start:editable.start,end:editable.end-1,text:'Verified live replacement.'},
  {kind:'cell',start:table.start,end:table.start,table:1,row:1,column:2,text:'Verified cell'},
  {kind:'image',start:last.end-1,end:last.end-1,path:image,widthPt:36}
 ]});assert.equal(edited.applied,3);passed.push('live replacement/table/image batch');
 const after=await run('word_get_paragraphs',target);assert.ok(after.paragraphs.some(p=>p.text==='Verified live replacement.'));
 const afterTable=await run('word_get_tables',target);assert.equal(afterTable.tables[0].cells[1].text,'Verified cell');
 properties=await run('word_get_document_properties',target);assert.equal(properties.images,1);passed.push('live readback');
 await assert.rejects(run('word_edit_batch',{...target,expectedRevision:'0'.repeat(64),requestKey:randomUUID(),dryRun:false,operations:[{kind:'insert',start:0,end:0,text:'MUST NOT RUN'}]}),/STALE_REVISION/);passed.push('stale revision rejected');
 assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'),originalHash);passed.push('disk original unchanged before save');
 properties=await run('word_get_document_properties',target);
 assert.equal((await run('word_save_document',{...target,expectedRevision:properties.revision})).saved,true);
 const zip=await JSZip.loadAsync(await fs.readFile(file)),xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/Verified live replacement/);assert.match(xml,/Verified cell/);assert.doesNotMatch(xml,/MUST NOT RUN/);assert.ok(zip.file(/^word\/media\//).length);passed.push('save and persisted DOCX verification');
 const backups=(await fs.readdir(path.join(config.stateDir,'backups'))).filter(n=>n.endsWith('.bak'));
 assert.ok(await Promise.all(backups.map(async n=>createHash('sha256').update(await fs.readFile(path.join(config.stateDir,'backups',n))).digest('hex'))).then(h=>h.includes(originalHash)));passed.push('original disk backup retained');
 const report={status:'passed',document:file,checks:passed};await fs.writeFile(path.join(root,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {
 await ctx.shutdown();
 // Close only this generated document; never quit Word or save any user file.
 if(opened){const literal=file.replaceAll("'","''");execFileSync(path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',`$app=[Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application'); foreach($doc in @($app.Documents)){if($doc.FullName -eq '${literal}'){$doc.Close(0)}}`],{windowsHide:true,timeout:15000,stdio:'pipe'});}
}
