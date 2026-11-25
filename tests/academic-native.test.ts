import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash,randomUUID } from 'node:crypto';
import { Document, Paragraph, Packer, Header, Footer, PageNumber, TextRun,TableOfContents,HeadingLevel } from 'docx';
import { PDFParse } from 'pdf-parse';
import { nativeCapabilities, ocrImage, renderDocx } from '../src/academic/native.js';
import { AuthorizedPaths } from '../src/security/paths.js';
import { ProcessRunner } from '../src/utils/process.js';
import type { AppContext, CallContext } from '../src/server/types.js';

const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function wordPids():number[]{const output=execFileSync(path.join(process.env.SystemRoot??'C:\\Windows','System32','tasklist.exe'),['/FI','IMAGENAME eq WINWORD.EXE','/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true,timeout:10000});return [...output.matchAll(/"WINWORD\.EXE","(\d+)"/ig)].map(match=>Number(match[1]));}
function existsPid(pid:number):boolean{try{process.kill(pid,0);return true;}catch(e:any){return e.code==='EPERM';}}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t:any){
 const parent=path.resolve('test-results');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'academic-native-'));const runner=new ProcessRunner();
 t.after(async()=>{await runner.stop();assert.equal(path.dirname(await fs.realpath(dir)),parent);await fs.rm(dir,{recursive:true,force:true});});
 const ctx={projectDir:process.cwd(),config:{maxReadBytes:5_000_000,toolTimeoutMs:90_000},paths:new AuthorizedPaths([dir]),emergency:{assertRunning(){}},runProcess:(exe:string,args:string[],opts:any)=>runner.run(exe,args,opts)} as unknown as AppContext;
 const call:CallContext={signal:new AbortController().signal,confirm:async()=>{throw new Error('Native read/render has no destructive action to approve');}};
 return {dir,ctx,call};
}

test('Native academic bridge uses fixed operations and no execution-policy bypass or global Word termination',async()=>{
 const source=await fs.readFile('scripts/academic-native.ps1','utf8');
 assert.match(source,/ValidateSet\('capabilities','ocr','render-docx'\)/);
 assert.doesNotMatch(source,/Invoke-Expression|ExecutionPolicy\s+Bypass|taskkill|Stop-Process|SendKeys|SendInput|mouse_event/i);
 for(const check of ['GetTokenInformation','JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE','beforeWord','AutomationSecurity=3','UpdateLinksAtOpen=$false','GetFileFromPathAsync','TryCreateFromLanguage'])assert.ok(source.includes(check),check);
});

test('Actual WinRT OCR recognizes synthetic authorized image and reports language/bounds',async t=>{
 if(process.platform!=='win32')return t.skip('Windows OCR requires Windows.');
 const f=await fixture(t);const caps=await nativeCapabilities(f.ctx,f.call);
 assert.equal(typeof caps.elevated,'boolean');assert.equal(caps.isolation.untrustedExecutionSupported,false);
 if(!caps.ocr.available)return t.skip('No Windows OCR languages are installed; no software is installed by tests.');
 const image=path.join(f.dir,'synthetic.png');
 const python=process.env.ACADEMIC_TEST_PYTHON??'C:\\Program Files\\Python313\\python.exe';
 execFileSync(python,['-c','from PIL import Image,ImageDraw,ImageFont; import sys; im=Image.new("RGB",(1200,230),"white"); d=ImageDraw.Draw(im); f=ImageFont.truetype("C:/Windows/Fonts/arial.ttf",48); d.text((35,60),"ACADEMIC OCR TEST 12345",font=f,fill="black"); im.save(sys.argv[1])',image],{timeout:20000,windowsHide:true});
 const before=hash(await fs.readFile(image));
 const language=caps.ocr.languages.find(l=>l.tag==='en-US')?.tag??caps.ocr.languages[0].tag;
 const result=await ocrImage(f.ctx,image,language,f.call);
 assert.match(result.text,/ACADEMIC OCR TEST 12345/i);assert.ok(result.lines.some(l=>l.bounds&&l.bounds.width>100));
 assert.equal(hash(await fs.readFile(image)),before);
 await assert.rejects(ocrImage(f.ctx,path.join(path.dirname(f.dir),'outside.png'),language,f.call),/DENIED/);
 await assert.rejects(ocrImage(f.ctx,image,'invalid;command',f.call),/language/);
 await assert.rejects(ocrImage(f.ctx,image,'zz-ZZ',f.call),/not installed|language/i);
});

test('Actual owned Word COM renders generated DOCX without changing source or overwriting output',async t=>{
 if(process.platform!=='win32')return t.skip('Word COM requires Windows.');
 const f=await fixture(t);const caps=await nativeCapabilities(f.ctx,f.call);
 if(!caps.word.available)return t.skip('Microsoft Word is not installed; no software is installed by tests.');
 const source=path.join(f.dir,'fixture.docx'),pdf=path.join(f.dir,'fixture.pdf');
 const beforeWord=wordPids();
 if(beforeWord.length)return t.skip('Word is already running; renderer protects existing personal sessions.');
 const document=new Document({sections:[{headers:{default:new Header({children:[new Paragraph('Academic fixture header')]})},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun('Page '),new TextRun({children:[PageNumber.CURRENT]}),new TextRun(' of '),new TextRun({children:[PageNumber.TOTAL_PAGES]})]})]})},children:[new Paragraph({text:'ACADEMIC RENDER FIXTURE',heading:'Title'}),new TableOfContents('Contents',{hyperlink:false,headingStyleRange:'1-2'}),new Paragraph({text:'Fixture introduction',heading:HeadingLevel.HEADING_1}),new Paragraph('Generated fixture only. The source document must remain unchanged.'),new Paragraph({text:'Fixture calculation',heading:HeadingLevel.HEADING_1}),new Paragraph('Calculation: 2 + 3 = 5.')]}]});
 await fs.writeFile(source,await Packer.toBuffer(document));const before=hash(await fs.readFile(source));
 let rendered:Record<string,unknown>;try{rendered=await renderDocx(f.ctx,source,pdf,f.call);}catch(e:any){if(/Word process is already running|Cannot uniquely identify a newly created Word/.test(e.message))return t.skip('Another Word fixture/session became active; busy protection refused it.');throw e;}
 assert.equal(rendered.ownedProcess,true);assert.equal(rendered.sourceOpenedReadOnly,true);assert.equal(rendered.macrosDisabled,true);assert.equal(rendered.sourceUnchanged,true);
 assert.equal(rendered.tablesOfContentsUpdated,1);assert.ok(Number(rendered.pageFieldsUpdated)>=2);
 assert.ok(Number(rendered.pages)>=1);assert.equal(hash(await fs.readFile(source)),before);
 const parser=new PDFParse({data:await fs.readFile(pdf)});
 try{const extracted=await parser.getText();assert.match(extracted.text,/ACADEMIC RENDER FIXTURE/);assert.match(extracted.text,/Calculation: 2 \+ 3 = 5/);assert.ok((extracted.text.match(/Fixture introduction/g)??[]).length>=2,'First heading must appear in both updated TOC and body.');assert.ok((extracted.text.match(/Fixture calculation/g)??[]).length>=2,'Second heading must appear in both updated TOC and body.');assert.match(extracted.text,/Page\s+1\s+of\s+1/);}finally{await parser.destroy();}
 await assert.rejects(renderDocx(f.ctx,source,pdf,f.call),/already exists/);
 await assert.rejects(renderDocx(f.ctx,source,path.join(path.dirname(f.dir),'outside.pdf'),f.call),/DENIED/);
 const leftovers=await fs.readdir(f.dir);assert.ok(!leftovers.some(n=>n.startsWith('mcp-render-')));
 const where=path.join(process.env.SystemRoot??'C:\\Windows','System32','where.exe');
 const pdftoppm=execFileSync(where,['pdftoppm.exe'],{encoding:'utf8',timeout:10000,windowsHide:true}).trim().split(/\r?\n/)[0];
 const prefix=path.join(f.dir,'rendered-page');execFileSync(pdftoppm,['-png','-r','100','-f','1','-singlefile',pdf,prefix],{timeout:30000,windowsHide:true});
 const png=await fs.readFile(`${prefix}.png`);assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.readUInt32BE(16)>500&&png.readUInt32BE(20)>500);
 if(process.env.ACADEMIC_KEEP_NATIVE_EVIDENCE==='1'){const evidence=path.join(path.dirname(f.dir),`academic-native-visual-${randomUUID()}`);await fs.mkdir(evidence);for(const [file,name]of [[source,'fixture.docx'],[pdf,'fixture.pdf'],[`${prefix}.png`,'page-1.png']])await fs.copyFile(file,path.join(evidence,name),1);t.diagnostic(`Native render visual evidence: ${path.join(evidence,'page-1.png')}`);}
 for(let i=0;i<50&&wordPids().some(pid=>!beforeWord.includes(pid));i++)await pause(100);
 assert.deepEqual(wordPids(),beforeWord,'Normal completion must leave no test-owned Word process.');
});

test('Abort/timeout cleanup closes the verified owned Word process through its job handle',async t=>{
 if(process.platform!=='win32')return t.skip('Word job cleanup requires Windows.');
 const f=await fixture(t);const caps=await nativeCapabilities(f.ctx,f.call);if(!caps.word.available)return t.skip('Word not installed.');if(wordPids().length)return t.skip('Word is already running; no personal sessions are used.');
 const source=path.join(f.dir,'abort-fixture.docx'),pdf=path.join(f.dir,'must-not-publish.pdf');await fs.writeFile(source,await Packer.toBuffer(new Document({sections:[{children:Array.from({length:500},(_,i)=>new Paragraph(`Disposable paragraph ${i}. The owned rendering process will be cancelled during native work.`))}]})));
 const controller=new AbortController();let rejected:unknown;const rendering=renderDocx(f.ctx,source,pdf,{...f.call,signal:controller.signal});rendering.catch(error=>{rejected=error;});
 let owner:{processId:number;killOnJobClose:boolean}|undefined;
 for(let i=0;i<800&&!owner;i++){
  for(const name of await fs.readdir(f.dir)){if(name.startsWith('mcp-render-')){try{owner=JSON.parse(await fs.readFile(path.join(f.dir,name,'owned-word.json'),'utf8'));}catch(e:any){if(!['ENOENT','SyntaxError'].includes(e.code??e.name))throw e;}}}
  if(rejected){if(/Word process is already running|Cannot uniquely identify a newly created Word/.test(String((rejected as Error).message)))return t.skip('Another Word fixture/session became active; busy protection refused it.');throw rejected;}if(!owner)await pause(25);
 }
 assert.ok(owner,'The test must observe verified native ownership before simulating timeout/disconnect.');assert.equal(owner.killOnJobClose,true);
 controller.abort(new Error('Synthetic disconnect/timeout after ownership.'));
 await assert.rejects(rendering,/cancel|abort|timed out/i);
 for(let i=0;i<100&&existsPid(owner.processId);i++)await pause(50);
 assert.equal(existsPid(owner.processId),false,'The owned Word job must exit when the managed bridge is terminated.');
 await assert.rejects(fs.stat(pdf));assert.ok(!(await fs.readdir(f.dir)).some(name=>name.startsWith('mcp-render-')));
});
