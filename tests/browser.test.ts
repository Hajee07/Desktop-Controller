import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { browserTools, redactBrowserText, validateBrowserUrl } from '../src/browser/index.js';
import {configSchema} from '../src/config/index.js';
import type { AppContext, AppConfig, CallContext } from '../src/server/types.js';
const installedChrome=path.join(process.env.ProgramFiles??'C:\\Program Files','Google','Chrome','Application','chrome.exe');

test('browser policy restricts origins, credentials, schemes, and sensitive URL parameters',()=>{
  const origins=['http://127.0.0.1:5000','https://example.com'];assert.equal(validateBrowserUrl('https://example.com/a',origins).origin,'https://example.com');
  for(const url of ['file:///C:/passwords','javascript:alert(1)','data:text/plain,x','https://evil.example','https://example.com.evil.org','https://user:secret@example.com','https://example.com/?token=secret'])assert.throws(()=>validateBrowserUrl(url,origins));
  assert.equal(redactBrowserText('Authorization: Bearer SECRET token=VALUE https://example.com/?password=hush').includes('SECRET'),false);
  assert.equal(redactBrowserText('token=VALUE').includes('VALUE'),false);
});

test('explicit wildcard policy permits arbitrary HTTP(S) origins while retaining URL safety checks',()=>{
  const parsed=configSchema.shape.browser.parse({allowedOrigins:['*']});
  assert.deepEqual(parsed.allowedOrigins,['*']);
  for(const url of ['https://www.onlinegantt.com/#/gantt','https://another.example/path','http://127.0.0.1:4173/'])
    assert.equal(validateBrowserUrl(url,parsed.allowedOrigins).href,url);
  for(const url of ['file:///C:/private','javascript:alert(1)','https://user:pass@example.com/','https://example.com/?token=secret'])
    assert.throws(()=>validateBrowserUrl(url,parsed.allowedOrigins));
});

test('browser previews are inert and schemas reject unknown/invalid input',async()=>{
  let confirmations=0;const ctx={config:{browser:{enabled:false,allowedOrigins:['https://example.com'],headless:true}},emergency:{assertRunning(){},onStop(){}}} as unknown as AppContext;
  const tools=browserTools(ctx),open=tools.find(t=>t.name==='browser_open')!;
  const call:CallContext={signal:new AbortController().signal,confirm:async()=>{confirmations++;}};
  assert.equal((await open.execute(open.schema.parse({url:'https://example.com'}),call) as any).dryRun,true);assert.equal(confirmations,0);
  await assert.rejects(open.execute(open.schema.parse({url:'https://example.com',dryRun:false}),call),/disabled/);
  assert.throws(()=>tools.find(t=>t.name==='browser_click')!.schema.parse({tab:0,selector:''}));
  for(const t of tools)assert.equal(typeof t.execute,'function');
});

test('Playwright isolated local website workflow and credential/mutation guards',{skip:!existsSync(chromium.executablePath())&&!existsSync(installedChrome)?'Neither Playwright Chromium nor the approved installed Chrome is available.':false},async()=>{
  let posts=0;const server=createServer((req,res)=>{
    if(req.method==='POST'){posts++;res.end('posted');return;}
    if(req.url==='/download'){res.setHeader('Content-Disposition','attachment; filename="fixture.txt"');res.end('download fixture');return;}
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Fixture</title><h1>Local browser fixture</h1><input id="ordinary" aria-label="Name"><button id="button" onclick="fetch('/change',{method:'POST',body:'x'})">Change</button><a id="download" href="/download">Download</a><input id="upload" type="file">${req.url==='/safe'?'':'<input id="password" type="password" value="MUST_NOT_READ">'}<div style="display:none">MUST_NOT_READ_HIDDEN</div><script>console.error('token=SHOULD_REDACT');</script>`);
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  await mkdir(path.resolve('test-results'),{recursive:true});const dir=await mkdtemp(path.resolve('test-results','browser-'));let stop:(()=>Promise<void>)|undefined;let confirmations=0;
  const ctx={config:{stateDir:path.join(dir,'state'),toolTimeoutMs:10000,browser:{enabled:true,allowedOrigins:['*'],headless:true},applications:existsSync(installedChrome)?{chrome:{executable:installedChrome,args:[],processNames:['chrome']}}:{}},paths:{check:async(p:string)=>{const absolute=path.resolve(p);if(!absolute.startsWith(dir+path.sep))throw new Error('Outside root');return absolute;}},backup:async()=>null,emergency:{assertRunning(){},onStop(fn:()=>Promise<void>){stop=fn;}}} as unknown as AppContext;
  const call:CallContext={signal:new AbortController().signal,confirm:async()=>{confirmations++;}};const tools=browserTools(ctx);
  const run=async(name:string,args:Record<string,unknown>)=>{const t=tools.find(t=>t.name===name)!;return t.execute(t.schema.parse(args),call) as Promise<any>;};
  try{
    const opened=await run('browser_open',{url:origin,dryRun:false}),tab=opened.tab;assert.equal(opened.title,'Fixture');assert.equal(confirmations,1);
    assert.ok((await run('browser_tabs',{})).tabs.some((x:any)=>x.tab===tab));
    const extracted=await run('browser_extract',{tab});assert.match(extracted.text,/Local browser fixture/);assert.doesNotMatch(JSON.stringify(extracted),/MUST_NOT_READ/);
    await assert.rejects(run('browser_fill',{tab,selector:'#password',text:'x',dryRun:false}),/credential/);
    await assert.rejects(run('browser_screenshot',{tab,path:path.join(dir,'capture.png'),dryRun:false}),/credential/);
    await run('browser_fill',{tab,selector:'#ordinary',text:'Ada',dryRun:false});
    await run('browser_click',{tab,selector:'#button',dryRun:false});await new Promise(r=>setTimeout(r,150));assert.equal(posts,0);
    await run('browser_click',{tab,selector:'#button',dryRun:false,networkApproval:{url:origin+'/change',method:'POST'}});await new Promise(r=>setTimeout(r,150));assert.equal(posts,1);
    const downloaded=path.join(dir,'download.txt');await run('browser_download',{tab,selector:'#download',path:downloaded,dryRun:false});assert.equal(await readFile(downloaded,'utf8'),'download fixture');
    const errors=await run('browser_console',{tab});assert.doesNotMatch(JSON.stringify(errors),/SHOULD_REDACT/);
    assert.equal((await run('browser_test',{tab,expectedTitle:'Fixture',selectors:['#ordinary']})).passed,true);
    assert.equal((await run('browser_search',{template:origin+'/?q={query}',query:'hello world'})).dryRun,true);
    assert.equal((await run('browser_navigate',{tab,url:origin+'/?q=next'})).dryRun,true);
    assert.equal((await run('browser_upload',{tab,selector:'#upload',path:downloaded,dryRun:false})).selected,true);
    await run('browser_navigate',{tab,url:origin+'/safe',dryRun:false});
    const png=path.join(dir,'capture.png');await run('browser_screenshot',{tab,path:png,dryRun:false});assert.equal((await readFile(png)).subarray(1,4).toString(),'PNG');
    const search=await run('browser_search',{template:origin+'/?q={query}',query:'hello world',dryRun:false});assert.equal(search.title,'Fixture');
    await run('browser_close',{tab,dryRun:false});
  }finally{await stop?.();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
