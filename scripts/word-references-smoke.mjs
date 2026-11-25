import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import JSZip from 'jszip';
import {loadConfig} from '../dist/config/index.js';
import {createContext} from '../dist/server/context.js';
import {allTools} from '../dist/server/index.js';

const project=path.resolve(import.meta.dirname,'..');
const root=await fs.mkdtemp(path.join(project,'workspace','word-references-'));
const document=path.join(root,'Synthetic Citations.docx');
const context=await createContext(await loadConfig(project),project);
const tools=allTools(context);
const call={get signal(){return AbortSignal.timeout(90000);},confirm:async()=>{throw new Error('Unexpected confirmation for owned fixture');}};
const run=(name,input)=>{
  const tool=tools.find(candidate=>candidate.name===name);
  return tool.execute(tool.schema.parse(input),call);
};
try {
  await run('academic_document_compose',{path:document,title:'Synthetic fixture',sections:[{heading:'Text',paragraphs:[{text:'Sample sentence for a citation.'}]},{heading:'References',paragraphs:[{text:'Bibliography follows.'}]}],dryRun:false});
  const opened=await run('word_open',{path:document,dryRun:false});
  const target={path:document,documentId:opened.documentId};
  const {paragraphs,revision}=await run('word_get_paragraphs',target);
  const citation=paragraphs.find(p=>p.text.includes('Sample sentence')).end-1;
  const bibliography=paragraphs.find(p=>p.text.includes('Bibliography follows')).end-1;
  await run('word_edit_batch',{...target,expectedRevision:revision,requestKey:randomUUID(),operations:[{kind:'citation',start:citation,end:citation,tag:'Smoke2026',source:{type:'Book',title:'Synthetic Research Handbook',authors:[{first:'Ada',last:'Example'}],year:'2026',city:'London',publisher:'Fixture Press'}},{kind:'bibliography',start:bibliography,end:bibliography}],dryRun:false});
  const references=await run('word_get_references',target);
  assert.equal(references.sources[0].tag,'Smoke2026');
  assert.match(references.fields.find(f=>f.kind==='citation').text,/Example/);
  assert.match(references.fields.find(f=>f.kind==='bibliography').text,/Synthetic Research Handbook/);
  await run('word_edit_batch',{...target,expectedRevision:references.revision,requestKey:randomUUID(),operations:[{kind:'bibliography-refresh',start:0,end:0}],dryRun:false});
  const final=await run('word_get_references',target);
  assert.match(final.fields.find(f=>f.kind==='bibliography').text,/Synthetic Research Handbook/);
  assert.equal((await run('word_save_document',{...target,expectedRevision:final.revision})).saved,true);
  const zip=await JSZip.loadAsync(await fs.readFile(document));
  const body=await zip.file('word/document.xml').async('string');
  assert.match(body,/CITATION Smoke2026/);
  assert.match(body,/BIBLIOGRAPHY/);
  const sources=await Promise.all(zip.file(/^customXml\/item\d+\.xml$/).map(file=>file.async('string')));
  assert.ok(sources.some(xml=>xml.includes('Smoke2026')&&xml.includes('Synthetic Research Handbook')));
  console.log(JSON.stringify({document,style:final.style,fields:final.fields.map(f=>f.kind),storedSource:true}));
} finally { await context.shutdown(); }
