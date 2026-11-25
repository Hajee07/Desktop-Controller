import path from 'node:path';
import { isUtf8 } from 'node:buffer';
import { z } from 'zod';
import { XMLParser,XMLValidator } from 'fast-xml-parser';
import type { AppContext,CallContext } from '../../server/types.js';
import { active,checkedFile,sha256 } from '../common.js';
import { extractDocument,type StructuredDocument } from '../extraction/index.js';
import { openOffice } from '../extraction/office.js';
import { reasoningInputDigest,type AcademicTask,type DeliverableContract,type FileReference,type TaskEvidence,type TaskStore } from './store.js';

export const deliverableFormats=['pdf','docx','xlsx','pptx','txt','md','csv','json','html','css','js','jsx','mjs','cjs','ts','tsx','py','c','cc','cpp','cxx','h','hpp','java','sql','xml','yaml','yml','toml'] as const;
const formats=new Set<string>(deliverableFormats);
export const codeFormats=new Set(['css','js','jsx','mjs','cjs','ts','tsx','py','c','cc','cpp','cxx','h','hpp','java','sql','html']);
const basename=z.string().min(1).max(250).refine(n=>n===path.basename(n)&&!/[\\/\x00-\x1f:*?"<>|]/.test(n)&&!/[. ]$/.test(n),'A plain output filename is required.');
export const deliverableContractSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),format:z.enum(deliverableFormats),path:z.string().min(1).max(4096).optional(),name:basename.optional(),questionIds:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(100)}).strict();
export interface ContractResolution {contracts:DeliverableContract[];issues:string[];inferred:boolean}
function inferredContract(raw:string,id:string,questions:string[]):DeliverableContract|null{
  const value=raw.trim();if(formats.has(value.toLowerCase()))return{id,format:value.toLowerCase(),questionIds:[...questions],origin:'legacy_inferred'};
  const ext=path.extname(value).slice(1).toLowerCase();if(!formats.has(ext))return null;
  if(path.isAbsolute(value))return{id,format:ext,path:path.resolve(value),questionIds:[...questions],origin:'legacy_inferred'};
  if(value!==path.basename(value)||!basename.safeParse(value).success)return null;return{id,format:ext,name:value,questionIds:[...questions],origin:'legacy_inferred'};
}
export function resolveContracts(task:Pick<AcademicTask,'deliverables'|'questions'|'deliverableContracts'|'deliverableContractsReviewed'>):ContractResolution{
  const issues:string[]=[],questionIds=task.questions.map(q=>q.id),inferred=task.deliverableContracts===undefined;
  const requirements=task.deliverables.map((value,index)=>({value,contract:inferredContract(value,`deliverable_${index+1}`,questionIds)}));let contracts:DeliverableContract[]=[];
  if(inferred){for(const r of requirements){if(!r.contract)issues.push(`Ambiguous deliverable '${r.value}': provide reviewed explicit format/name/path and question mappings.`);else contracts.push(r.contract);}}
  else{if(task.deliverableContractsReviewed!==true)issues.push('Explicit deliverable contracts require host review.');for(const item of task.deliverableContracts??[]){
      const {origin:ignored,...value}=item;const result=deliverableContractSchema.safeParse(value);if(!result.success){issues.push('Invalid persisted deliverable contract; review and replace it.');continue;}contracts.push({...result.data,origin:'explicit'});}
    for(const r of requirements)if(r.contract&&!contracts.some(c=>c.format===r.contract!.format&&(!r.contract!.path||c.path&&path.resolve(c.path).toLowerCase()===r.contract!.path.toLowerCase())&&(!r.contract!.name||(c.name??(c.path?path.basename(c.path):'')).toLowerCase()===r.contract!.name.toLowerCase())))issues.push(`Explicit contracts do not preserve requested deliverable '${r.value}'.`);
  }
  // A bare format plus a named file of that format describes the same legacy requirement.
  if(inferred)contracts=contracts.filter(c=>c.path||c.name||!contracts.some(other=>other!==c&&other.format===c.format&&(other.path||other.name)));
  const seen=new Set<string>(),ids=new Set<string>();contracts=contracts.filter(c=>{const key=[c.format,c.path?.toLowerCase()??c.name?.toLowerCase()??'any'].join(':');if(seen.has(key)){if(!inferred)issues.push('Deliverable contracts must not duplicate the same output requirement.');return false;}seen.add(key);if(ids.has(c.id))issues.push('Deliverable contract IDs must be unique.');ids.add(c.id);return true;});
  for(const c of contracts){if(c.path&&!path.isAbsolute(c.path))issues.push(`Deliverable ${c.id} requires an absolute path.`);if(c.path&&c.name&&path.basename(c.path).toLowerCase()!==c.name.toLowerCase())issues.push(`Deliverable ${c.id} path and name disagree.`);for(const filename of [c.path,c.name].filter(Boolean) as string[])if(path.extname(filename).slice(1).toLowerCase()!==c.format)issues.push(`Deliverable ${c.id} filename extension differs from its requested format.`);if(new Set(c.questionIds).size!==c.questionIds.length)issues.push(`Deliverable ${c.id} repeats a question ID.`);if(c.questionIds.some(id=>!questionIds.includes(id)))issues.push(`Deliverable ${c.id} maps an unknown question ID.`);}
  if(!contracts.length)issues.push('No concrete final deliverable contracts have been specified.');for(const id of questionIds)if(!contracts.some(c=>c.questionIds.includes(id)))issues.push(`Question ${id} has no mapped final deliverable.`);
  return{contracts,issues:[...new Set(issues)],inferred};
}
export async function validateContractPaths(ctx:AppContext,contracts:DeliverableContract[]):Promise<void>{for(const c of contracts)if(c.path)await ctx.paths.check(c.path,'write');}
export function normalizedAnswer(text:string):string{return text.normalize('NFKC').replace(/[\u00ad\u200b\ufeff]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\s+/gu,' ').trim();}

const xmlParser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,parseTagValue:false});
function parseXml(value:string){if(/<!DOCTYPE|<!ENTITY/i.test(value)||XMLValidator.validate(value)!==true)throw new Error('Invalid/unsafe output XML.');return xmlParser.parse(value);}
const array=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
interface OutputInspection {reference:FileReference;format:string;text:string;structure:string;document?:StructuredDocument}
async function inspectOutput(ctx:AppContext,ref:FileReference,call:CallContext,cache:Map<string,Promise<StructuredDocument>>):Promise<OutputInspection>{
  const file=await checkedFile(ctx,ref.path,call.signal);if(file.sha256!==ref.sha256)throw new Error('Final artifact bytes changed after its checkpoint.');if(!file.buffer.length)throw new Error('Final artifacts cannot be empty.');const format=path.extname(file.path).slice(1).toLowerCase();if(!formats.has(format))throw new Error('Final artifact format is unsupported for structural verification.');
  let text='',document:StructuredDocument|undefined;
  if(['pdf','docx','xlsx','pptx'].includes(format)){
    if(format==='pdf'){if(!file.buffer.subarray(0,8).toString('ascii').startsWith('%PDF-'))throw new Error('Output extension is PDF but its bytes are not a PDF.');}
    else{const zip=await openOffice(file.buffer,ctx.config,call.signal),content=zip.file('[Content_Types].xml'),rootRels=zip.file('_rels/.rels');if(!content||!rootRels)throw new Error('Output is not a complete Office package.');const types=parseXml(await content.async('string')),rels=parseXml(await rootRels.async('string'));
      const main={docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'}[format as 'docx'|'xlsx'|'pptx'];const mime={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'}[format as 'docx'|'xlsx'|'pptx'];
      if(!array(types.Types?.Override).some(o=>o['@_PartName']==='/'+main&&o['@_ContentType']===mime)||!array(rels.Relationships?.Relationship).some(r=>String(r['@_Type']).endsWith('/officeDocument')&&r['@_TargetMode']!=='External'&&path.posix.normalize(String(r['@_Target']).replace(/^\//,''))===main))throw new Error('Office package main type/relationship does not match the requested file extension.');
      if(Object.keys(zip.files).some(n=>/vbaProject\.bin$/i.test(n)))throw new Error('Macro-bearing final Office artifacts are not accepted.');const part=zip.file(main);if(!part)throw new Error('Required Office main document part is missing.');const tree=parseXml(await part.async('string'));
      if(format==='docx'&&tree.document?.body===undefined)throw new Error('DOCX has no document body.');if(format==='xlsx'&&!array(tree.workbook?.sheets?.sheet).length)throw new Error('XLSX contains no worksheets.');if(format==='xlsx'&&array(tree.workbook?.sheets?.sheet).length>50)throw new Error('XLSX exceeds the bounded 50-sheet completion inspection.');
    }
    const key=file.path.toLowerCase();let pending=cache.get(key);if(!pending){pending=extractDocument(ctx,file.path,call);cache.set(key,pending);}document=await pending;if(document.sha256!==ref.sha256)throw new Error('Output changed while parsing.');
    if(format==='pdf'&&(!Number(document.metadata.totalPages)||Number(document.metadata.totalPages)>100))throw new Error('PDF page count is empty or exceeds bounded completion inspection (100 pages).');if(format==='pptx'&&(!Number(document.metadata.slideCount)||Number(document.metadata.slideCount)>200))throw new Error('PPTX slide count is empty or exceeds bounded completion inspection (200 slides).');
    if(document.warnings.some(w=>/reached the text\/segment limit|extraction stopped|only the first \d+/i.test(w)))throw new Error('Output content exceeded bounded structural extraction; completion remains unverified.');
    const body=document.segments.filter(s=>format==='docx'?s.location.section==='body'||String(s.location.section).startsWith('body-table-'):format==='pptx'?s.kind==='slide-text':true);text=body.map(s=>s.text).join('\n');if(!text.trim()&&!(document.images?.length))throw new Error('Final document has no parsed body content or embedded images.');
  }else{
    if(!isUtf8(file.buffer)||file.buffer.includes(0))throw new Error('Text/code output must be valid UTF-8 without binary NUL bytes.');text=file.buffer.toString('utf8');if(!text.trim())throw new Error('Text/code final artifact is blank.');
    if(format==='json'){const json=JSON.parse(text);const leaves:string[]=[];const collect=(v:any,depth=0)=>{if(depth>80||leaves.length>10000)throw new Error('JSON output exceeds inspection bounds.');if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')leaves.push(String(v));else if(Array.isArray(v))v.forEach(x=>collect(x,depth+1));else if(v&&typeof v==='object')Object.values(v).forEach(x=>collect(x,depth+1));};collect(json);text=leaves.join('\n');}
    if(format==='xml'){parseXml(text);text=text.replace(/<[^>]+>/g,' ');}
    if(format==='html'){if(!/<(?:!doctype|html|head|body|[a-z][\w-]*(?:\s|>))/i.test(text))throw new Error('HTML output contains no markup.');text=text.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");}
    if(format==='csv')text=text.replace(/""/g,'"');
  }
  active(ctx,call);return{reference:{...ref,path:file.path},format,text:normalizedAnswer(text),structure:['pdf','docx','xlsx','pptx'].includes(format)?'Parsed bounded document structure and main format.':'Validated nonempty UTF-8/text syntax where supported; code correctness requires execution evidence.',document};
}
interface CommittedAnswer {questionId:string;explanation:string;classification:string;citations:{sourceId:string;segmentId:string;quotedText?:string}[];request:any}
function committedAnswers(store:TaskStore,task:AcademicTask):{answers:Map<string,CommittedAnswer>;issues:string[]}{
  const answers=new Map<string,CommittedAnswer>(),requests=new Map<string,any>(),issues:string[]=[];
  for(const ref of task.answers){try{let request=requests.get(ref.requestId);if(!request){const row=store.db.prepare('SELECT task_id,status,body FROM reasoning_requests WHERE id=?').get(ref.requestId) as any;if(!row||row.task_id!==task.id||row.status!=='committed')throw new Error('Missing committed reasoning result.');request=JSON.parse(row.body);requests.set(ref.requestId,request);}if(request.inputDigest!==reasoningInputDigest(task))throw new Error('Committed answer requirements or source snapshots changed.');const answer=request.result?.answers?.find((a:any)=>a.questionId===ref.questionId);if(!answer||typeof answer.explanation!=='string'||!answer.explanation.trim())throw new Error('Committed explanation is unavailable.');if(JSON.stringify((answer.citations??[]).map((c:any)=>({sourceId:c.sourceId,segmentId:c.segmentId})))!==JSON.stringify(ref.citations))throw new Error('Stored answer citation mapping changed.');answers.set(ref.questionId,{...answer,request});}catch{issues.push(`Question ${ref.questionId} has no current intact committed answer result.`);}}
  for(const q of task.questions)if(!answers.has(q.id))issues.push(`Question ${q.id} has no current committed answer to verify against final output.`);return{answers,issues};
}
export async function verifyCompletionIntegrity(ctx:AppContext,store:TaskStore,task:AcademicTask,call:CallContext):Promise<{checks:TaskEvidence[];blocking:string[]}>{
  const checks:TaskEvidence[]=[],blocking:string[]=[];const add=(id:string,category:string,issues:string[],details:string,refs:FileReference[]=[])=>{checks.push({id,category,status:issues.length?'failed':'passed',details:issues.length?issues.join('\n'):details,origin:'computed',inputHashes:refs,artifacts:[],createdAt:new Date().toISOString()});blocking.push(...issues);};
  const resolution=resolveContracts(task);add('deliverable_contracts','deliverable_contracts',resolution.issues,'Requested formats/names and per-question deliverable mappings are explicit or strictly inferred.');
  const finals=[...new Map(task.steps.flatMap(s=>s.artifacts).filter(f=>f.role==='final').map(f=>[f.path.toLowerCase(),f])).values()];const cache=new Map<string,Promise<StructuredDocument>>(),outputs=new Map<string,OutputInspection>(),structureIssues:string[]=[];
  for(const ref of finals){try{const inspected=await inspectOutput(ctx,ref,call,cache);outputs.set(ref.path.toLowerCase(),inspected);}catch{active(ctx,call);structureIssues.push(`Final artifact ${path.basename(ref.path)} is unavailable, changed, malformed, blank, or outside bounded format inspection.`);}}
  if(!finals.length)structureIssues.push('No final artifacts were checkpointed.');add('artifact_structure','artifact_structure',structureIssues,'Every final artifact has actual bounded format/structure validation.',finals);
  const committed=committedAnswers(store,task),citationIssues=[...committed.issues],sourceRefs=new Map<string,FileReference>();
  for(const answer of committed.answers.values())for(const citation of answer.citations){try{
    const ref=answer.request.sources?.find((s:any)=>s.sourceId===citation.sourceId);if(!ref||!task.inputFiles.some(f=>f.path.toLowerCase()===String(ref.path).toLowerCase()&&f.sha256===ref.sha256))throw new Error('Citation source is not selected.');const key=ref.path.toLowerCase();let pending=cache.get(key);if(!pending){pending=extractDocument(ctx,ref.path,call);cache.set(key,pending);}const doc=await pending,segment=doc.segments.find(s=>s.id===citation.segmentId);if(doc.sha256!==ref.sha256||doc.sourceId!==citation.sourceId||!segment||!ref.segmentIds?.includes(citation.segmentId))throw new Error('Canonical citation changed.');if(citation.quotedText&&!normalizedAnswer(segment.text.slice(0,ref.segmentChars?.[citation.segmentId]??6000)).includes(normalizedAnswer(citation.quotedText)))throw new Error('Quote changed.');sourceRefs.set(key,{path:doc.path,sha256:doc.sha256,canonicalSourceId:doc.sourceId,role:'citation_source'});
  }catch{active(ctx,call);citationIssues.push(`Question ${answer.questionId} cites a source/segment that is no longer current or authorized (including OCR provenance changes).`);}}
  add('committed_citation_freshness','committed_citation_freshness',[...new Set(citationIssues)],'Committed answer results and actual current canonical source/segment IDs remain intact.',[...sourceRefs.values()]);
  const outputIssues:string[]=[],covered=new Set<string>();
  for(const contract of resolution.contracts){let candidates=[...outputs.values()].filter(o=>o.format===contract.format);if(contract.path)candidates=candidates.filter(o=>o.reference.path.toLowerCase()===path.resolve(contract.path!).toLowerCase());if(contract.name)candidates=candidates.filter(o=>path.basename(o.reference.path).toLowerCase()===contract.name!.toLowerCase());
    if(candidates.length!==1){outputIssues.push(`Deliverable ${contract.id} requires exactly one actual ${contract.name??contract.path??contract.format} final artifact; found ${candidates.length}.`);continue;}const output=candidates[0];
    for(const qid of contract.questionIds){const answer=committed.answers.get(qid);if(!answer){outputIssues.push(`Deliverable ${contract.id} cannot map question ${qid}: its committed answer is unavailable.`);continue;}
      if(task.kind==='coding'&&codeFormats.has(output.format)){const evidence=[...task.evidence].reverse().find(e=>e.category==='coding_tests'&&e.origin==='computed'&&e.status==='passed'&&e.inputHashes.some(f=>f.sha256===output.reference.sha256));if(!evidence){outputIssues.push(`Deliverable ${contract.id} code bytes have no matching passing execution evidence for question ${qid}.`);continue;}}
      else if(!output.text.includes(normalizedAnswer(answer.explanation))){outputIssues.push(`Deliverable ${contract.id} is missing the complete committed explanation for question ${qid}. Preserve the answer wording in the artifact or recommit the reviewed final wording.`);continue;}
      covered.add(qid);
    }
  }
  for(const q of task.questions)if(!covered.has(q.id))outputIssues.push(`Question ${q.id} has no verified answer content in a mapped final artifact.`);
  add('answer_artifact_coverage','answer_artifact_coverage',[...new Set(outputIssues)],'Every required mapped artifact contains the full committed explanation, or exact tested code bytes for coding output. Matching ignores Unicode/whitespace presentation only; it does not establish scientific correctness.',finals);
  return{checks,blocking:[...new Set(blocking)]};
}
