import path from 'node:path';
import JSZip from 'jszip';
import {XMLParser,XMLValidator,XMLBuilder}from'fast-xml-parser';
import type{StructuredDocument,SourceLocation}from'./types.js';
import{sha256}from'../common.js';
import {openOfficeArchive,type OfficeArchiveLimits} from '../../utils/office-archive.js';
import {MAX_EXTRACTED_TEXT_CHARACTERS} from '../../utils/text-limits.js';

const parser=new XMLParser({preserveOrder:true,ignoreAttributes:false,parseTagValue:false,trimValues:false,processEntities:true});
const tag=(n:any)=>Object.keys(n).find(k=>k!==':@')??'';
const children=(n:any):any[]=>Array.isArray(n?.[tag(n)])?n[tag(n)]:[];
const attr=(n:any,key:string)=>n?.[':@']?.['@_'+key];
function nodes(tree:any[],name:string):any[]{const out:any[]=[];for(const n of tree){if(tag(n)===name)out.push(n);out.push(...nodes(children(n),name));}return out;}
function text(tree:any[]):string {return tree.map(n=>tag(n)==='#text'?String(n['#text']):['w:tab'].includes(tag(n))?'\t':['w:br','a:br'].includes(tag(n))?'\n':text(children(n))).join('');}
function texts(tree:any[],name:string):string[]{return nodes(tree,name).map(n=>text(children(n)));}
function wordText(tree:any[]):string{return tree.map(n=>tag(n)==='w:t'?text(children(n)):tag(n)==='w:tab'?'\t':tag(n)==='w:br'?'\n':wordText(children(n))).join('');}
function prop(tree:any[],name:string,key='w:val'){return attr(nodes(tree,name)[0],key);}
export function addSegment(doc:StructuredDocument,kind:string,content:string,location:SourceLocation){
 const raw=content.replace(/\u0000/g,'');if(raw.length>20000)doc.warnings.push('Text at '+JSON.stringify(location)+' exceeds the 20,000-character segment bound and was truncated; inspect the original source for omitted content.');const cleaned=raw.slice(0,20000);if(!cleaned.trim())return;
 const used=doc.segments.reduce((n,s)=>n+s.text.length,0);if(doc.segments.length>=2500||used>=MAX_EXTRACTED_TEXT_CHARACTERS){if(!doc.warnings.includes('Structured extraction reached the text/segment limit.'))doc.warnings.push('Structured extraction reached the text/segment limit.');return;}
 const value=cleaned.slice(0,MAX_EXTRACTED_TEXT_CHARACTERS-used);doc.segments.push({id:'seg_'+sha256(kind+JSON.stringify(location)+value).slice(0,16),text:value,kind,location});
}
export const openOffice=openOfficeArchive;
export async function xml(zip:JSZip,name:string):Promise<any[]>{
 const entry=zip.file(name);if(!entry)throw new Error('Missing Office part: '+name);const raw=await entry.async('string');
 if(/<!DOCTYPE|<!ENTITY/i.test(raw)||XMLValidator.validate(raw)!==true)throw new Error('Unsafe or invalid Office XML');return parser.parse(raw);
}
function tableRows(tree:any[],rowTag:string,cellTag:string,paragraphTag:string):string[][]{
 return nodes(tree,rowTag).slice(0,1000).map(row=>children(row).filter(c=>tag(c)===cellTag).slice(0,100).map(cell=>nodes(children(cell),paragraphTag).map(p=>text(children(p))).join('\n').slice(0,10000)));
}
function imageAssets(zip:JSZip,prefix:string){return Object.keys(zip.files).filter(name=>name.startsWith(prefix)&&/\.(png|jpe?g)$/i.test(name)).slice(0,100).map(name=>({id:'img_'+sha256(name).slice(0,16),part:name,mimeType:/\.png$/i.test(name)?'image/png':'image/jpeg',bytes:Number((zip.files[name] as any)._data?.uncompressedSize??0),requiresVision:true}));}
async function docx(doc:StructuredDocument,zip:JSZip,signal:AbortSignal){
 const main=await xml(zip,'word/document.xml');const body=nodes(main,'w:body')[0];let paragraph=0;let table=0;
 const styles:any[]=[];
 if(zip.file('word/styles.xml'))for(const style of nodes(await xml(zip,'word/styles.xml'),'w:style').slice(0,200)){styles.push({id:attr(style,'w:styleId'),name:prop(children(style),'w:name'),basedOn:prop(children(style),'w:basedOn'),font:prop(children(style),'w:rFonts','w:ascii'),sizeHalfPoints:prop(children(style),'w:sz'),spacing: nodes(children(style),'w:spacing')[0]?.[':@']});}
 const paragraphs:any[]=[];
 for(const node of children(body)){
  signal.throwIfAborted();
  if(tag(node)==='w:p'){
   paragraph++;const style=prop(children(node),'w:pStyle');const value=wordText(children(node));const display=text(children(node)).trim();
   const kind=/heading/i.test(style??'')?'heading':/code|source|preformatted/i.test(style??'')?'code':/caption/i.test(style??'')||/^(?:figure|table)\s+\d/i.test(display)?'caption':'paragraph';
   addSegment(doc,kind,value||display,{paragraph,section:'body'});
   paragraphs.push({paragraph,style:style??null,alignment:prop(children(node),'w:jc'),font:prop(children(node),'w:rFonts','w:ascii'),sizeHalfPoints:prop(children(node),'w:sz'),bold:nodes(children(node),'w:b').length>0,spacing:nodes(children(node),'w:spacing')[0]?.[':@']});
   for(const formula of nodes(children(node),'m:oMath'))addSegment(doc,'equation',texts(children(formula),'m:t').join(''),{paragraph,section:'body'});
  }else if(tag(node)==='w:tbl'){
   table++;const rows=tableRows(children(node),'w:tr','w:tc','w:p');const location={paragraph:paragraph+1,section:'body-table-'+table};doc.tables.push({location,rows});addSegment(doc,'table',rows.map(r=>r.join('\t')).join('\n'),location);
  }
 }
 for(const part of Object.keys(zip.files).filter(name=>/^word\/(?:(?:header|footer)\d+|footnotes|endnotes)\.xml$/.test(name)).sort()){
  const tree=await xml(zip,part);let p=0;for(const node of nodes(tree,'w:p'))addSegment(doc,part.includes('header')?'header':part.includes('footer')?'footer':part.includes('footnotes')?'footnote':'endnote',wordText(children(node)),{paragraph:++p,section:part});
 }
 const sections=nodes(main,'w:sectPr').map(section=>({margins:nodes(children(section),'w:pgMar')[0]?.[':@'],pageSize:nodes(children(section),'w:pgSz')[0]?.[':@'],pageNumbering:nodes(children(section),'w:pgNumType')[0]?.[':@']}));
 const fields=[...nodes(main,'w:fldSimple').map(n=>attr(n,'w:instr')), ...texts(main,'w:instrText')].filter(Boolean);
 const math=nodes(main,'m:oMath').slice(0,100).map(n=>({text:texts(children(n),'m:t').join(''),omml:new XMLBuilder({preserveOrder:true,ignoreAttributes:false}).build([n])}));
 doc.metadata={...doc.metadata,styles,paragraphFormatting:paragraphs,sections,fields,equations:math,pagination:'Unknown until layout rendering; paragraph references are authoritative.'};
 doc.images=imageAssets(zip,'word/media/');doc.warnings.push('DOCX page numbers are not inferred. Headers/footers may vary by section; layout requires rendering.');
}
async function powerpoint(doc:StructuredDocument,zip:JSZip,signal:AbortSignal){
 const presentation=await xml(zip,'ppt/presentation.xml');const rels=await xml(zip,'ppt/_rels/presentation.xml.rels');const relations=nodes(rels,'Relationship');
 let slides=nodes(presentation,'p:sldId').map(node=>{const r=relations.find(n=>attr(n,'Id')===attr(node,'r:id'));return r&&attr(r,'TargetMode')!=='External'?path.posix.normalize(path.posix.join('ppt',String(attr(r,'Target')))):'';}).filter(Boolean);
 if(!slides.length)slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
 for(let index=0;index<Math.min(slides.length,200);index++){
  signal.throwIfAborted();const part=slides[index];if(!/^ppt\/slides\/[^/]+\.xml$/.test(part))throw new Error('Invalid slide part');const tree=await xml(zip,part);let paragraph=0;
  for(const node of nodes(tree,'a:p'))addSegment(doc,'slide-text',text(children(node)),{slide:index+1,paragraph:++paragraph});
  for(const node of nodes(tree,'a:tbl')){const rows=tableRows(children(node),'a:tr','a:tc','a:p');doc.tables.push({location:{slide:index+1},rows});}
  const relPart=path.posix.join(path.posix.dirname(part),'_rels',path.posix.basename(part)+'.rels');
  if(zip.file(relPart))for(const rel of nodes(await xml(zip,relPart),'Relationship')){
   if(!String(attr(rel,'Type')).endsWith('/notesSlide')||attr(rel,'TargetMode')==='External')continue;const target=path.posix.normalize(path.posix.join(path.posix.dirname(part),String(attr(rel,'Target'))));if(!/^ppt\/notesSlides\/[^/]+\.xml$/.test(target))continue;
   addSegment(doc,'speaker-notes',texts(await xml(zip,target),'a:t').join('\n'),{slide:index+1,section:'speaker-notes'});
  }
 }
 doc.metadata={...doc.metadata,slideCount:slides.length};doc.images=imageAssets(zip,'ppt/media/');if(slides.length>200)doc.warnings.push('Only the first 200 slides were extracted.');doc.warnings.push('Slide images, charts and diagrams require visual inspection; text does not describe their meaning.');
}
function inline(tree:any[]):string{return texts(tree,'t').join('');}
async function spreadsheet(doc:StructuredDocument,zip:JSZip,signal:AbortSignal){
 const shared=zip.file('xl/sharedStrings.xml')?nodes(await xml(zip,'xl/sharedStrings.xml'),'si').map(n=>inline(children(n))):[];
 const workbook=await xml(zip,'xl/workbook.xml');const relations=nodes(await xml(zip,'xl/_rels/workbook.xml.rels'),'Relationship');const formulas:any[]=[];let cells=0;
 for(const sheet of nodes(workbook,'sheet').slice(0,50)){
  signal.throwIfAborted();const name=String(attr(sheet,'name'));const rel=relations.find(n=>attr(n,'Id')===attr(sheet,'r:id'));if(!rel||attr(rel,'TargetMode')==='External')continue;
  const target=String(attr(rel,'Target'));const part=target.startsWith('/')?target.slice(1):path.posix.normalize(path.posix.join('xl',target));if(!/^xl\/worksheets\/[^/]+\.xml$/.test(part))throw new Error('Invalid worksheet part');
  const tree=await xml(zip,part);const rows:any[]=[];
  for(const row of nodes(tree,'row')){
   const output:any[]=[];
   for(const node of children(row).filter(n=>tag(n)==='c')){
    signal.throwIfAborted();if(++cells>10000){doc.warnings.push('Spreadsheet extraction stopped at 10,000 cells.');break;}
    const ref=String(attr(node,'r')??'');if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref))continue;const kind=attr(node,'t');const raw=texts(children(node),'v')[0];const formula=texts(children(node),'f')[0];
    const value=kind==='s'?shared[Number(raw)]??'':kind==='inlineStr'?inline(children(node)):kind==='b'?raw==='1'?'TRUE':'FALSE':raw??'';const location={sheet:name,cell:ref};
    output.push({cell:ref,value,formula:formula??null});addSegment(doc,formula?'formula':'cell',formula?`=${formula}\nCached value: ${value}`:value,location);if(formula)formulas.push({location,formula,cachedValue:value});
   }
   rows.push(output);if(cells>10000)break;
  }
  doc.tables.push({location:{sheet:name},rows});if(cells>10000)break;
 }
 doc.metadata={...doc.metadata,formulas,formulasEvaluated:false};doc.images=imageAssets(zip,'xl/media/');doc.warnings.push('Formulas are extracted, never calculated. Cached values can be stale; dates may remain numeric serials.');
}
export async function extractOffice(doc:StructuredDocument,buffer:Buffer,signal:AbortSignal,limits:OfficeArchiveLimits={}){const zip=await openOffice(buffer,limits,signal);if(doc.format==='docx')await docx(doc,zip,signal);else if(doc.format==='pptx')await powerpoint(doc,zip,signal);else await spreadsheet(doc,zip,signal);}
