import{test,before,after}from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import path from'node:path';
import PDFDocument from'pdfkit';
import{Document,Packer,Paragraph,Header,Footer,TextRun,ImageRun,PageNumber,HeadingLevel,Table,TableRow,TableCell}from'docx';
import PptxGenJS from'pptxgenjs';
import JSZip from'jszip';
import{defaultConfig}from'../src/config/index.js';
import{createContext}from'../src/server/context.js';
import{extractDocument,extractionTools}from'../src/academic/extraction/index.js';
import{renderReport}from'../src/filesystem/documents.js';
import{ToolMediaResult}from'../src/server/media.js';
import type{CallContext}from'../src/server/types.js';
let project:string;let folder:string;let ctx:Awaited<ReturnType<typeof createContext>>;
const call:CallContext={signal:new AbortController().signal,async confirm(){throw new Error('No dialog expected for extraction');}};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJxkAAAAASUVORK5CYII=','base64');
const file=(name:string)=>path.join(folder,name);
async function invoke(name:string,input:Record<string,unknown>){const tool=extractionTools(ctx).find(t=>t.name===name)!;return await tool.execute(tool.schema.parse(input),call)as any;}
before(async()=>{await fs.mkdir('test-results',{recursive:true});project=await fs.mkdtemp(path.resolve('test-results/extraction-'));folder=path.join(project,'workspace');await fs.mkdir(folder);ctx=await createContext(defaultConfig(project),project);});
after(async()=>{await ctx.shutdown();assert.ok(project.startsWith(path.resolve('test-results')+path.sep));await fs.rm(project,{recursive:true,force:true});});
test('structured PDF extraction preserves actual page numbers and vector table provenance',async()=>{
 const chunks:Buffer[]=[];const pdf=new PDFDocument();const done=new Promise<Buffer>(resolve=>{pdf.on('data',x=>chunks.push(x));pdf.on('end',()=>resolve(Buffer.concat(chunks)));});
 pdf.text('Question 1: Explain transport. [5 marks]',50,40);pdf.rect(50,80,200,30).stroke();pdf.moveTo(150,80).lineTo(150,110).stroke();pdf.text('Item',55,90);pdf.text('Value',155,90);pdf.addPage().text('Question 2: Calculate engine output. [10 marks]');pdf.end();await fs.writeFile(file('instructions.pdf'),await done);
 const result=await extractDocument(ctx,file('instructions.pdf'),call);assert.equal(result.metadata.totalPages,2);assert.ok(result.segments.some(s=>s.location.page===2&&s.text.includes('Question 2')));assert.ok(result.tables.some(t=>t.location.page===1));assert.match(result.sourceId,/^src_[a-f0-9]{24}$/);assert.match(result.sha256,/^[a-f0-9]{64}$/);
 const again=await extractDocument(ctx,file('instructions.pdf'),call);assert.deepEqual(result.segments.map(s=>s.id),again.segments.map(s=>s.id));
});
test('PDF page viewing emits actual PNG MCP media and export is dry-run/create-only',async()=>{
 const media=await invoke('academic_document_page_view',{path:file('instructions.pdf'),page:1,width:600});assert.ok(media instanceof ToolMediaResult);assert.equal(media.images.length,1);const bytes=Buffer.from(media.images[0].data,'base64');assert.equal(bytes.subarray(1,4).toString(),'PNG');
 const output=file('page.png');assert.equal((await invoke('academic_document_page_export',{path:file('instructions.pdf'),page:1,outputPath:output})).dryRun,true);await assert.rejects(()=>fs.stat(output));
 await invoke('academic_document_page_export',{path:file('instructions.pdf'),page:1,outputPath:output,dryRun:false});assert.ok((await fs.stat(output)).size>1000);await assert.rejects(()=>invoke('academic_document_page_export',{path:file('instructions.pdf'),page:1,outputPath:output,dryRun:false}),/exist/i);
 await assert.rejects(()=>invoke('academic_document_page_view',{path:file('instructions.pdf'),page:99}),/range/);
});
test('extreme PDF page aspect ratios are rejected before allocating a raster canvas',async()=>{
 const parts:Buffer[]=[];const pdf=new PDFDocument({size:[100,1_000_000]});const done=new Promise<Buffer>(resolve=>{pdf.on('data',p=>parts.push(p));pdf.on('end',()=>resolve(Buffer.concat(parts)));});pdf.text('Extreme dimension fixture',1,1);pdf.end();await fs.writeFile(file('extreme.pdf'),await done);await assert.rejects(()=>invoke('academic_document_page_view',{path:file('extreme.pdf'),page:1,width:600}),/pixel|aspect/);
});
test('DOCX exposes structure tables headers footers formatting and embedded image',async()=>{
 const doc=new Document({styles:{paragraphStyles:[{id:'Code',name:'Code',basedOn:'Normal',run:{font:'Consolas',size:20}}]},sections:[{properties:{page:{margin:{top:1000,bottom:1000,left:1200,right:1200}}},headers:{default:new Header({children:[new Paragraph('University laboratory record')]})},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun('Page '),new TextRun({children:[PageNumber.CURRENT]})]})]})},children:[new Paragraph({text:'Experiment 04',heading:HeadingLevel.HEADING_1}),new Paragraph({text:'int main() { return 0; }',style:'Code'}),new Table({rows:[new TableRow({children:[new TableCell({children:[new Paragraph('Observed')]}),new TableCell({children:[new Paragraph('12.3')]})]})]}),new Paragraph({children:[new ImageRun({type:'png',data:png,transformation:{width:8,height:8}})]})]}]});
 await fs.writeFile(file('record.docx'),await Packer.toBuffer(doc));const result=await extractDocument(ctx,file('record.docx'),call);assert.ok(result.segments.some(s=>s.kind==='heading'&&s.text==='Experiment 04'));assert.ok(result.segments.some(s=>s.kind==='code'));assert.ok(result.segments.some(s=>s.kind==='header'));assert.ok(result.segments.some(s=>s.kind==='footer'));assert.equal(result.tables[0].rows[0][1],'12.3');assert.ok(result.segments.every(s=>s.location.page===undefined));assert.ok((result.metadata.styles as any[]).some(s=>s.id==='Code'));assert.ok((result.images??[]).length>0);
 const image=await invoke('academic_document_image_view',{path:file('record.docx'),part:result.images![0].part});assert.ok(image instanceof ToolMediaResult);assert.equal(image.images[0].mimeType,'image/png');
});
test('embedded raster images reject decompression-scale dimensions before forwarding to vision',async()=>{
 const zip=await JSZip.loadAsync(await fs.readFile(file('record.docx')));const oversized=Buffer.from(png);oversized.writeUInt32BE(1_000_000,16);zip.file('word/media/oversized.png',oversized);await fs.writeFile(file('oversized-image.docx'),await zip.generateAsync({type:'nodebuffer'}));await assert.rejects(()=>invoke('academic_document_image_view',{path:file('oversized-image.docx'),part:'word/media/oversized.png'}),/dimensions|pixel/);
});
test('PPTX extracts slide order speaker notes and native tables',async()=>{
 const deck=new(PptxGenJS as any)();const slide=deck.addSlide();slide.addText('Lecture topic',{x:1,y:1,w:8,h:1});slide.addTable([['Concept','Definition'],['LSA','Latent semantic analysis']],{x:1,y:2,w:8});slide.addNotes('Lecturer notes for the current subject');deck.addSlide().addText('Second slide',{x:1,y:1,w:8,h:1});await fs.writeFile(file('lecture.pptx'),Buffer.from(await deck.write({outputType:'nodebuffer'})));
 const result=await extractDocument(ctx,file('lecture.pptx'),call);assert.equal(result.metadata.slideCount,2);assert.ok(result.segments.some(s=>s.location.slide===2&&s.text==='Second slide'));assert.ok(result.segments.some(s=>s.kind==='speaker-notes'&&s.text.includes('Lecturer notes')));assert.ok(result.tables.some(t=>t.location.slide===1&&t.rows[1][0]==='LSA'));
});
test('XLSX preserves formula source and cell coordinates without calculating',async()=>{
 const data=await renderReport('xlsx',{title:'Calculations',columns:['Item','Value'],rows:[['Sample',42]]});const zip=await JSZip.loadAsync(data);const xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string');zip.file('xl/worksheets/sheet1.xml',xml.replace('</sheetData>','<row r="4"><c r="B4"><f>SUM(B3,2)</f><v>44</v></c></row></sheetData>'));await fs.writeFile(file('calculation.xlsx'),await zip.generateAsync({type:'nodebuffer'}));
 const result=await extractDocument(ctx,file('calculation.xlsx'),call);const formula=result.segments.find(s=>s.kind==='formula')!;assert.equal(formula.location.sheet,'Report');assert.equal(formula.location.cell,'B4');assert.match(formula.text,/SUM\(B3,2\)/);assert.equal(result.metadata.formulasEvaluated,false);
});
test('code extraction supports C/C++ and rejects unauthorized and unsafe sources',async()=>{
 await fs.writeFile(file('main.cpp'),'#include <iostream>\nint main(){ return 0; }');const source=await extractDocument(ctx,file('main.cpp'),call);assert.equal(source.segments[0].kind,'code');assert.match(source.segments[0].location.section!,/lines 1-2/);
 await assert.rejects(()=>extractDocument(ctx,path.join(project,'package.json'),call));
 const zip=new JSZip();zip.file('word/document.xml','<!DOCTYPE foo [<!ENTITY x "boom">]><w:document><w:body/></w:document>');await fs.writeFile(file('unsafe.docx'),await zip.generateAsync({type:'nodebuffer'}));await assert.rejects(()=>extractDocument(ctx,file('unsafe.docx'),call),/Unsafe/);
});
test('scanned PDF rendering and native Windows OCR work together without cursor input',{skip:process.platform!=='win32'},async()=>{
 const parts:Buffer[]=[];const pdf=new PDFDocument();const ready=new Promise<Buffer>(resolve=>{pdf.on('data',b=>parts.push(b));pdf.on('end',()=>resolve(Buffer.concat(parts)));});pdf.fontSize(30).text('SCANNED LAB REPORT 42',60,90);pdf.end();await fs.writeFile(file('ocr-text.pdf'),await ready);
 const image=await invoke('academic_document_page_view',{path:file('ocr-text.pdf'),page:1,width:1400});const raster=Buffer.from(image.images[0].data,'base64');const chunks:Buffer[]=[];const scan=new PDFDocument();const scanned=new Promise<Buffer>(resolve=>{scan.on('data',b=>chunks.push(b));scan.on('end',()=>resolve(Buffer.concat(chunks)));});scan.image(raster,0,0,{width:612,height:792});scan.end();await fs.writeFile(file('scan.pdf'),await scanned);
 const extracted=await extractDocument(ctx,file('scan.pdf'),call);assert.ok(extracted.warnings.some(w=>w.includes('OCR')));assert.ok(!extracted.segments.some(s=>s.text.includes('SCANNED LAB')));
 const originalProject=ctx.projectDir;ctx.projectDir=path.resolve('.');try{const result=await invoke('academic_pdf_ocr',{path:file('scan.pdf'),page:1,imagePath:file('ocr-working.png'),width:1400,language:'en-US',dryRun:false});assert.match(result.text,/SCANNED LAB REPORT 42/i);assert.equal(result.location.page,1);assert.equal(result.method,'windows_ocr');assert.equal(result.verificationRequired,true);assert.equal(result.cached,true);const canonical=await extractDocument(ctx,file('scan.pdf'),call);assert.equal(canonical.sourceId,result.sourceId);assert.ok(canonical.segments.some(s=>s.id===result.segmentId&&s.kind==='ocr'&&s.text.includes('SCANNED LAB')));assert.ok((canonical.metadata.ocrPages as any[]).some(r=>r.engine==='windows_ocr'&&r.page===1&&r.textSha256));const fresh=await extractDocument(ctx,file('scan.pdf'),call);assert.equal(fresh.sourceId,canonical.sourceId);assert.deepEqual(fresh.segments,canonical.segments);}finally{ctx.projectDir=originalProject;}
});
