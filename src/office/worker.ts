import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import path from 'node:path';
import {createInterface} from 'node:readline';
import type {AppContext} from '../server/types.js';
export class OfficeWorker {
  private process?:ChildProcessWithoutNullStreams;private tail:Promise<unknown>=Promise.resolve();private pending?:{resolve:(value:any)=>void;reject:(error:Error)=>void};
  constructor(private ctx:AppContext){ctx.emergency.onStop(async()=>this.close());}
  private start(){if(this.process)return;const child=spawn(path.join(this.ctx.projectDir,'dist/native/WindowsHelper.exe'),[],{windowsHide:true,stdio:'pipe'});this.process=child;const reader=createInterface({input:child.stdout});
    reader.on('line',line=>{if(this.process!==child)return;try{const result=JSON.parse(line),p=this.pending;this.pending=undefined;if(result.ok)p?.resolve(result.result);else p?.reject(new Error(result.error));}catch{this.pending?.reject(new Error('Office protocol response invalid'));this.close();}});
    child.stderr.on('data',()=>{});const failed=()=>{if(this.process===child){const pending=this.pending;this.pending=undefined;this.process=undefined;pending?.reject(new Error('OFFICE_CONNECTION_LOST: inspect document before retrying mutations'));}reader.close();};child.once('error',failed);child.once('exit',failed);
  }
  call(payload:Record<string,unknown>,signal?:AbortSignal):Promise<any>{const run=async()=>{signal?.throwIfAborted();this.ctx.emergency.assertRunning();this.start();return await new Promise((resolve,reject)=>{const stop=()=>{this.close();reject(new Error('OFFICE_CANCELLED_OR_TIMEOUT: inspect state before retrying'));};const timer=setTimeout(stop,this.ctx.config.toolTimeoutMs);signal?.addEventListener('abort',stop,{once:true});const finish=(fn:(v:any)=>void,v:any)=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);fn(v);};this.pending={resolve:v=>finish(resolve,v),reject:e=>finish(reject,e)};this.process!.stdin.write(JSON.stringify({...payload,maxXmlCharacters:384*1024*1024})+'\n');});};const result=this.tail.then(run,run);this.tail=result.catch(()=>{});return result;}
  close(){const child=this.process,pending=this.pending;this.process=undefined;this.pending=undefined;pending?.reject(new Error('OFFICE_CONNECTION_CLOSED: inspect prior effects before retrying'));if(child){child.stdin.end();child.kill();}}
}
