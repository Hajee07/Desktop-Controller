import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {AppContext,ToolDefinition} from '../server/types.js';
import {spssAnalysisTools,spssPython} from './spss-analysis.js';
import {comprehensiveSpssTools} from '../spss/index.js';
import {constants} from 'node:fs';
import {reserveOutput} from '../storage/index.js';

const python=spssPython;
let child:ReturnType<typeof spawn>|undefined, openedPath:string|undefined;
let pending:{resolve:(value:any)=>void;reject:(error:Error)=>void}|undefined;
let queue:Promise<unknown>=Promise.resolve();
function start(ctx:AppContext){
 if(child&&child.exitCode===null&&!child.killed)return child;
 child=spawn(python,[path.join(ctx.projectDir,'scripts','spss-output-worker.py')],{cwd:ctx.projectDir,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
 const current=child;
 ctx.emergency.onStop(async()=>{if(child===current){pending?.reject(new Error('SPSS_VIEWER_STOPPED'));pending=undefined;child=undefined;openedPath=undefined;current.stdin?.end();current.kill();}});
 current.stderr?.on('data',()=>{});
 current.on('error',e=>{if(child!==current)return;pending?.reject(e);pending=undefined;child=undefined;openedPath=undefined;});
 current.on('exit',()=>{if(child!==current)return;pending?.reject(new Error('SPSS_WORKER_DISCONNECTED'));pending=undefined;child=undefined;openedPath=undefined;});
 createInterface({input:current.stdout!}).on('line',line=>{if(child!==current)return;const p=pending;pending=undefined;if(!p)return;try{p.resolve(JSON.parse(line));}catch{p.reject(new Error('SPSS_WORKER_INVALID_RESPONSE'));}});
 return current;
}
async function request(ctx:AppContext,payload:object,signal:AbortSignal){
 const run=async()=>{signal.throwIfAborted();ctx.emergency.assertRunning();const process=start(ctx);
  const reply=await new Promise<any>((resolve,reject)=>{
   const abort=()=>{process.kill();finish(reject,new Error('SPSS_VIEWER_CANCELLED_OR_TIMEOUT'));};
   const timer=setTimeout(abort,ctx.config.toolTimeoutMs);
   const finish=(callback:(value:any)=>void,value:any)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);pending=undefined;callback(value);};
   signal.addEventListener('abort',abort,{once:true});
   pending={resolve:value=>finish(resolve,value),reject:error=>finish(reject,error)};
   process.stdin!.write(JSON.stringify(payload)+'\n',error=>{if(error)finish(reject,error);});
  });
  if(!reply?.ok)throw new Error('SPSS_OUTPUT_FAILED: '+String(reply?.error??'Unknown error'));return reply.result;};
 const result=queue.then(run,run);queue=result.then(()=>undefined,()=>undefined);return result;
}
export function spssTools(ctx:AppContext):ToolDefinition[]{return [
 ...spssAnalysisTools(ctx),
 ...comprehensiveSpssTools(ctx),
 {name:'spss_output_open',description:'Open an authorized .spv in native IBM SPSS Viewer; return file, Viewer title and output objects.',schema:z.object({path:z.string().min(1)}).strict(),readOnly:false,async execute(i,c){const file=await ctx.paths.check(i.path);if(path.extname(file).toLowerCase()!=='.spv'||!(await fs.stat(file)).isFile())throw new Error('Authorized existing .spv required');if(!(await fs.stat(python).catch(()=>null))?.isFile())throw new Error('IBM SPSS bundled Python unavailable');const result=await request(ctx,{operation:'open',path:file},c.signal);openedPath=file;const windows=await ctx.runPowerShell('windows',{},c.signal);const matching=(Array.isArray(windows)?windows:[windows]).filter((w:any)=>String(w.title).includes(path.basename(file))&&/SPSS Statistics Viewer/i.test(String(w.title)));return {...result,filename:path.basename(file),viewerWindows:matching,verifiedVisible:matching.length>0};}},
 {name:'spss_output_list',description:'List native SPSS output tree objects and current selection.',schema:z.object({}).strict(),readOnly:true,async execute(_,c){if(!openedPath)throw new Error('SPSS_OUTPUT_NOT_OPEN');return request(ctx,{operation:'list'},c.signal);}},
 {name:'spss_output_select',description:'Select and display one SPSS output object by index in the native Viewer.',schema:z.object({index:z.number().int().min(0).max(999)}).strict(),readOnly:false,async execute(i,c){if(!openedPath)throw new Error('SPSS_OUTPUT_NOT_OPEN');return request(ctx,{operation:'select',index:i.index},c.signal);}}
 ,{name:'spss_output_values',description:'Read paginated actual pivot-table cells from the native SPSS Scripting DataCellArray API.',schema:z.object({index:z.number().int().min(0).max(999),rowOffset:z.number().int().min(0).default(0),columnOffset:z.number().int().min(0).default(0),maxRows:z.number().int().min(1).max(100).default(50),maxColumns:z.number().int().min(1).max(100).default(50)}).strict(),readOnly:true,async execute(i,c){if(!openedPath)throw new Error('SPSS_OUTPUT_NOT_OPEN');return request(ctx,{...i,operation:'values'},c.signal);}}
 ,{name:'spss_get_application_status',description:'Read native SPSS GUI version, license options, open output paths and Data/Syntax Editor document counts.',schema:z.object({}).strict(),readOnly:true,async execute(_,c){return request(ctx,{operation:'status'},c.signal);}}
 ,{name:'spss_viewer_close_output',description:'Close only the connector-selected Viewer document if SPSS reports no unsaved modifications.',schema:z.object({}).strict(),readOnly:false,async execute(_,c){if(!openedPath)throw new Error('SPSS_OUTPUT_NOT_OPEN');const result=await request(ctx,{operation:'close'},c.signal);openedPath=undefined;return result;}}
 ,...(['document','chart'] as const).map(kind=>({
  name:kind==='chart'?'spss_viewer_export_chart':'spss_viewer_export_output',
  description:kind==='chart'?'Export an actual selected SPSS chart object as a new authorized PNG.':'Export the connector-selected Viewer to a new authorized PDF, Word DOC, XLSX or text document.',
  schema:z.object({path:z.string().min(1),format:z.enum(['pdf','doc','xlsx','text','png']),index:z.number().int().min(0).max(999).optional(),dryRun:z.boolean().default(true)}).strict(),readOnly:false,
  async execute(i:any,c:any){
   if(!openedPath)throw new Error('SPSS_OUTPUT_NOT_OPEN');
   if(kind==='chart'?(i.format!=='png'||i.index===undefined):i.format==='png')throw new Error('SPSS_VIEWER_EXPORT_ARGUMENTS_INVALID');
   const output=await ctx.paths.check(i.path,'write');
   if(!(i.format==='text'?['.txt','.text']:['.'+i.format]).includes(path.extname(output).toLowerCase()))throw new Error('SPSS_EXPORT_EXTENSION_MISMATCH');
   const exists=await fs.lstat(output).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
   if(exists)throw new Error('SPSS_OUTPUT_EXISTS');
   if(i.dryRun)return{dryRun:true,path:output,format:i.format};
   const directory=await fs.mkdtemp(path.join(ctx.config.stateDir,'spss-viewer-export-'));
   const staged=path.join(directory,'output.'+i.format);
   const release=await reserveOutput(ctx,output,64*1024*1024,c.signal);
   try{
    await request(ctx,{operation:kind==='chart'?'chart':'export',format:i.format,path:staged,index:i.index},c.signal);
    const files=await fs.readdir(directory);
    const matching=files.filter(file=>(i.format==='text'?['.txt','.text']:['.'+i.format]).includes(path.extname(file).toLowerCase()));
    if(matching.length!==1)throw new Error('SPSS_VIEWER_EXPORT_MULTIFILE: '+files.join(', '));
    const source=path.join(directory,matching[0]),stat=await fs.lstat(source);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>64*1024*1024)throw new Error('SPSS_VIEWER_EXPORT_LIMIT');
    c.signal.throwIfAborted();ctx.emergency.assertRunning();
    await fs.copyFile(source,await ctx.paths.check(output,'write'),constants.COPYFILE_EXCL);
    return{path:output,bytes:stat.size,format:i.format};
   }finally{release();for(const file of await fs.readdir(directory)){const source=path.join(directory,file);if((await fs.lstat(source)).isFile())await fs.unlink(source);}await fs.rmdir(directory).catch(()=>{});}
  }
 }))
];}
