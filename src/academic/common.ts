import {reserveOutput} from '../storage/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash}from'node:crypto';
import type{AppContext,CallContext}from'../server/types.js';
export const sha256=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function active(ctx:AppContext,call:CallContext){call.signal.throwIfAborted();ctx.emergency.assertRunning();}
export async function academicState(ctx:AppContext):Promise<string>{
 const state=path.resolve(ctx.config.stateDir);const s=await fs.lstat(state);if(!s.isDirectory()||s.isSymbolicLink()||(await fs.realpath(state)).toLowerCase()!==state.toLowerCase())throw new Error('Unsafe server state');
 const dir=path.join(state,'academic');try{await fs.mkdir(dir);}catch(e:any){if(e.code!=='EEXIST')throw e;}
 if((await fs.lstat(dir)).isSymbolicLink()||(await fs.realpath(dir)).toLowerCase()!==dir.toLowerCase())throw new Error('Unsafe academic state');return dir;
}
export async function checkedFile(ctx:AppContext,input:string,signal?:AbortSignal):Promise<{path:string;buffer:Buffer;sha256:string}>{
 signal?.throwIfAborted();const processingLimit=Math.min(ctx.config.maxReadBytes,ctx.config.maxDocumentProcessingBytes??256*1024*1024);const target=await ctx.paths.check(input);const before=await fs.lstat(target);if(!before.isFile()||before.isSymbolicLink()||before.nlink>1||before.size>processingLimit)throw new Error('Source must be a bounded ordinary file');
 const handle=await fs.open(target,'r');try{const opened=await handle.stat();if(opened.ino!==before.ino||opened.dev!==before.dev||opened.nlink>1||!opened.isFile()||opened.size>processingLimit)throw new Error('Source identity changed before read');const chunks:Buffer[]=[];let size=0;while(true){signal?.throwIfAborted();const chunk=Buffer.alloc(Math.min(65536,processingLimit+1-size));const r=await handle.read(chunk,0,chunk.length,null);if(!r.bytesRead)break;chunks.push(chunk.subarray(0,r.bytesRead));size+=r.bytesRead;if(size>processingLimit)throw new Error('Source grew beyond the configured bound');}await ctx.paths.check(target);const after=await fs.lstat(target),end=await handle.stat();if(after.ino!==opened.ino||after.dev!==opened.dev||end.size!==opened.size||end.mtimeMs!==opened.mtimeMs||after.nlink>1)throw new Error('Source changed during read');const buffer=Buffer.concat(chunks);return{path:target,buffer,sha256:sha256(buffer)};}finally{await handle.close();}
}
export async function academicDatabasePath(ctx:AppContext,name:string):Promise<string>{
 if(!/^[a-z_-]+\.sqlite$/.test(name))throw new Error('Invalid academic database name');const file=path.join(await academicState(ctx),name);
 for(const suffix of ['','-journal','-wal','-shm'])try{const s=await fs.lstat(file+suffix);if(!s.isFile()||s.isSymbolicLink()||s.nlink>1||(await fs.realpath(file+suffix)).toLowerCase()!==(file+suffix).toLowerCase())throw new Error('Unsafe academic database/sidecar');}catch(e:any){if(e.code!=='ENOENT')throw e;}
 return file;
}
export async function writeNew(ctx:AppContext,input:string,data:Buffer|string,call:CallContext):Promise<{path:string;sha256:string;bytes:number}>{
 active(ctx,call);const target=await ctx.paths.check(input,'write');await ctx.paths.check(path.dirname(target));active(ctx,call);const release=await reserveOutput(ctx,target,Buffer.byteLength(data)+65536,call.signal);try{await fs.writeFile(target,data,{flag:'wx',signal:call.signal});}finally{release();}return{path:target,sha256:sha256(data),bytes:Buffer.byteLength(data)};
}
