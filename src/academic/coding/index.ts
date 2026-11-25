import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isWithin } from '../../security/paths.js';
import { nativeCapabilities } from '../native.js';
import { recordTaskEvidence, taskStore, withTaskWork } from '../orchestration/store.js';
import { checkedFile } from '../common.js';
import type { AppContext, CallContext, ToolDefinition } from '../../server/types.js';

const hash=(input:string|Buffer)=>createHash('sha256').update(input).digest('hex');
const language=z.enum(['c','cpp','python','java','javascript','typescript','html','css','react','sql','other']);
const relativePath=z.string().min(1).max(500).refine(value=>!path.isAbsolute(value)&&!value.startsWith('\\')&&!value.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f:*?"<>|]/.test(p)),'An ordinary relative working-copy path is required');
const caseSchema=z.object({name:z.string().min(1).max(100),stdin:z.string().max(100000).default(''),expectedStdout:z.string().max(250000),expectedExitCode:z.number().int().min(0).max(255).default(0),comparison:z.enum(['exact','trim','lines']).default('exact')}).strict();
const runSchema=z.object({
 project:z.string().min(1),workingDirectory:z.string().min(1),sources:z.array(z.object({path:z.string().min(1),relativePath}).strict()).min(1).max(100),
 language,compileCommandId:z.string().min(1).max(64).optional(),runCommandId:z.string().min(1).max(64),trustedCode:z.boolean().default(false),
 cases:z.array(caseSchema).min(1).max(20),timeoutMs:z.number().int().min(100).max(30000).default(5000),
 restrictions:z.array(z.string().min(1).max(1000)).max(30).default([]),taskId:z.string().uuid().optional(),expectedPlanSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),dryRun:z.boolean().default(true)
}).strict();
type RunInput=z.infer<typeof runSchema>;
type Snapshot={path:string;relativePath:string;sha256:string;bytes:number};
type Command={id:string;executable:string;args:string[];description:string;requiresConfirmation:boolean;allowNetwork:boolean};
type Execution={stdout:string;stderr:string;exitCode:number;durationMs:number;timedOut:boolean;outputLimitExceeded:boolean};
const supportedSource=/\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|py|java|js|jsx|mjs|cjs|ts|tsx|json|html|htm|css|scss|sql|md|txt|toml|xml|yaml|yml|csv)$/i;
function redacted(value:string):string{return value.replace(/(bearer\s+)\S+/ig,'$1[REDACTED]').replace(/((?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*)[^\s,;&]+/ig,'$1[REDACTED]');}
function assertActive(ctx:AppContext,call:CallContext){call.signal.throwIfAborted();ctx.emergency.assertRunning();}
function sanitizedEnvironment():NodeJS.ProcessEnv{const env:NodeJS.ProcessEnv={};for(const name of ['SystemRoot','WINDIR','SystemDrive','COMSPEC','TEMP','TMP','PATH','PATHEXT','USERPROFILE','LOCALAPPDATA','APPDATA','JAVA_HOME'])if(process.env[name])env[name]=process.env[name];env.NO_COLOR='1';return env;}
async function regularExecutable(file:string):Promise<void>{
 if(!path.isAbsolute(file)||!file.toLowerCase().endsWith('.exe')||/^(?:\\\\|\/\/)/.test(file))throw new Error('Coding commands require absolute local .exe paths.');
 let cursor=path.parse(file).root;for(const part of path.resolve(file).slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);const s=await fs.lstat(cursor);if(s.isSymbolicLink()||(await fs.realpath(cursor)).toLowerCase()!==cursor.toLowerCase())throw new Error('Coding executables cannot use symlinks, junctions, or aliases.');}
 if(!(await fs.stat(file)).isFile())throw new Error('Coding executable is not a regular file.');
}
function configured(ctx:AppContext,id:string):Command{const item=Object.hasOwn(ctx.config.commands,id)?ctx.config.commands[id]:undefined;if(!item)throw new Error(`COMMAND_DENIED: command ID ${id} is not locally configured.`);return{id,...item,args:[...item.args]};}
function normalize(value:string,mode:'exact'|'trim'|'lines'):string{if(mode==='exact')return value;if(mode==='trim')return value.trim();return value.replace(/\r\n/g,'\n').split('\n').map(line=>line.trimEnd()).join('\n').trimEnd();}

async function prepare(ctx:AppContext,input:RunInput,call:CallContext){
 assertActive(ctx,call);
 const project=await ctx.paths.check(input.project);if(!(await fs.stat(project)).isDirectory())throw new Error('Coding project must be an authorized directory.');
 const working=await ctx.paths.check(input.workingDirectory,'write');
 if(await fs.lstat(working).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw new Error('Working directory must be new; choose a separate test-run folder.');
 const parent=await ctx.paths.check(path.dirname(working));if(!(await fs.stat(parent)).isDirectory())throw new Error('Working directory parent must already exist.');
 const snapshots:Snapshot[]=[];const targets=new Set<string>();let total=0;
 for(const item of input.sources){
  const source=await ctx.paths.check(item.path);if(!isWithin(project,source))throw new Error('All selected source files must belong to the declared project.');
  if(!supportedSource.test(source))throw new Error('Only ordinary supported source/data files can enter a coding working copy.');
  const target=await ctx.paths.check(path.join(working,item.relativePath),'write');if(!isWithin(working,target)||path.resolve(target).toLowerCase()===path.join(working,'coding-verification.json').toLowerCase())throw new Error('Source destination conflicts with the run report.');
  const key=path.resolve(target).toLowerCase();if(targets.has(key))throw new Error('Working-copy destinations must be unique.');targets.add(key);
  const info=await fs.stat(source);if(!info.isFile()||info.size>ctx.config.maxReadBytes)throw new Error('Source exceeds the configured ordinary-file read limit.');total+=info.size;if(total>10_000_000)throw new Error('Selected sources exceed the 10 MB aggregate limit.');
  snapshots.push({path:source,relativePath:item.relativePath,sha256:(await checkedFile(ctx,source,call.signal)).sha256,bytes:info.size});
 }
 const primary:Record<string,RegExp>={c:/\.c$/i,cpp:/\.(cpp|cc|cxx)$/i,python:/\.py$/i,java:/\.java$/i,javascript:/\.(js|jsx|mjs|cjs)$/i,typescript:/\.(ts|tsx)$/i,html:/\.html?$/i,css:/\.(css|scss)$/i,react:/\.(jsx|tsx)$/i,sql:/\.sql$/i};
 if(primary[input.language]&&!snapshots.some(source=>primary[input.language].test(source.path)))throw new Error('Declared programming language does not match any selected primary source file.');
 const compile=input.compileCommandId?configured(ctx,input.compileCommandId):undefined;const run=configured(ctx,input.runCommandId);const commands=[...(compile?[compile]:[]),run];
 const unavailable:string[]=[];
 for(const command of commands){try{await regularExecutable(command.executable);}catch(e:any){
   // A fixed, configured compiled executable may be produced inside this new working directory.
   if(e.code==='ENOENT'&&command===run&&compile&&isWithin(working,path.resolve(command.executable))){await ctx.paths.check(command.executable,'write');}
   else if(e.code==='ENOENT')unavailable.push(`${command.id}: configured executable is not installed at ${command.executable}`);else throw e;
  }}
 const commandSha256=hash(JSON.stringify(commands));const casesSha256=hash(JSON.stringify(input.cases));
 const plan={language:input.language,project,workingDirectory:working,sources:snapshots,commands,commandSha256,casesSha256,timeoutMs:input.timeoutMs,restrictions:input.restrictions,trustedCode:input.trustedCode,taskId:input.taskId??null};
 return{plan,planSha256:hash(JSON.stringify(plan)),unavailable,compile,run,snapshots,project,working};
}

async function workingHashes(ctx:AppContext,working:string,sources:Snapshot[],call:CallContext){
 const checks:{path:string;sha256:string}[]=[];
 for(const source of sources){const file=await checkedFile(ctx,path.join(working,source.relativePath),call.signal);checks.push({path:file.path,sha256:file.sha256});}
 return checks;
}
async function executedFiles(ctx:AppContext,command:Command,working:string,call:CallContext){
 const result:{path:string;sha256:string}[]=[];
 for(const candidate of [command.executable,...command.args]){
  if(candidate.startsWith('-'))continue;const target=path.resolve(working,candidate);if(!isWithin(working,target))continue;
  try{const file=await ctx.paths.check(target);const info=await fs.stat(file);if(!info.isFile())continue;if(info.size>25_000_000)throw new Error('Generated executed artifact exceeds the 25 MB hashing bound.');result.push({path:file,sha256:hash(await fs.readFile(file,{signal:call.signal}))});}catch(e:any){if(e.code!=='ENOENT')throw e;}
 }
 return result;
}

/** Scoped same-user process runner for approved trusted code. This is deliberately not called a sandbox. */
async function executeFixed(ctx:AppContext,command:Command,cwd:string,stdin:string,timeoutMs:number,call:CallContext):Promise<Execution>{
 assertActive(ctx,call);await regularExecutable(command.executable);
 const start=Date.now();
 return new Promise((resolve,reject)=>{
  const child=spawn(command.executable,command.args,{cwd,env:sanitizedEnvironment(),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',bytes=0,timedOut=false,outputLimitExceeded=false,settled=false,aborted=false;
  const terminate=()=>{if(child.pid&&child.exitCode===null&&!child.killed){const killer=spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore',env:sanitizedEnvironment()});killer.once('error',()=>child.kill());}};
  const abort=()=>{aborted=true;terminate();};const timer=setTimeout(()=>{timedOut=true;terminate();},timeoutMs);
  call.signal.addEventListener('abort',abort,{once:true});if(call.signal.aborted)abort();
  const finish=(error?:Error,code=1)=>{if(settled)return;settled=true;clearTimeout(timer);call.signal.removeEventListener('abort',abort);if(error)reject(error);else if(aborted)reject(new Error('Coding test cancelled.'));else resolve({stdout,stderr,exitCode:code,durationMs:Date.now()-start,timedOut,outputLimitExceeded});};
  const append=(stream:'stdout'|'stderr',chunk:Buffer)=>{bytes+=chunk.length;if(bytes>512000){outputLimitExceeded=true;terminate();return;}if(stream==='stdout')stdout+=chunk.toString('utf8');else stderr+=chunk.toString('utf8');};
  child.stdout.on('data',chunk=>append('stdout',chunk));child.stderr.on('data',chunk=>append('stderr',chunk));child.stdin.on('error',()=>{});
  child.once('error',error=>finish(error));child.once('close',code=>finish(undefined,code??1));
  child.once('spawn',()=>child.stdin.end(stdin,'utf8'));
 });
}

export function codingTools(ctx:AppContext):ToolDefinition[]{return[
 {name:'academic_coding_capabilities',description:'Inspect configured coding command IDs and installed compiler/runtime paths, OCR/Word capability, elevation, and genuine isolation limits. Does not install or launch visible applications.',schema:z.object({}).strict(),readOnly:true,execute:async(_,call)=>({...(await nativeCapabilities(ctx,call)),configuredCommandIds:Object.keys(ctx.config.commands),executionPolicy:'Only explicitly trusted code under a non-elevated token. No OS isolation backend is configured; untrusted code is refused. allowNetwork is a request description, not a firewall.'})},
 {name:'academic_coding_test',description:'Preview or test explicitly trusted source files in a new authorized working copy using only locally configured fixed command IDs. Requires current plan hash and confirmation. Refuses elevated/untrusted execution; no OS sandbox is claimed. Compiles when configured, feeds bounded stdin cases, compares actual output, and saves source/command-hashed verification.',schema:runSchema,readOnly:false,destructive:true,openWorld:true,execute:async(raw,call)=>{
  const input=runSchema.parse(raw);const work=async(call:CallContext)=>{
  if(input.taskId){const store=await taskStore(ctx);store.assertMutable(store.load(input.taskId));}
  const prepared=await prepare(ctx,input,call);
  const preview={dryRun:true,planSha256:prepared.planSha256,...prepared.plan,unavailable:prepared.unavailable,isolation:{backend:'none',workingCopyOnly:true,networkEnforced:false,filesystemSandbox:false},caseCount:input.cases.length,restrictionReviewRequired:input.restrictions.length>0};
  if(input.dryRun)return preview;
  if(!input.expectedPlanSha256||input.expectedPlanSha256!==prepared.planSha256)throw new Error('A current preview plan SHA-256 is required; sources, commands, cases, or restrictions changed.');
  const caps=await nativeCapabilities(ctx,call);
  const blocking=[...prepared.unavailable,...(!input.trustedCode?['Untrusted code requires a real separately configured OS isolation backend; none is configured.']:[]),...(caps.elevated?['Current Windows token is elevated. Start Codex/MCP under a normal non-administrator token before coding execution.']:[])];
  if(blocking.length){if(input.taskId)await recordTaskEvidence(ctx,input.taskId,{id:`coding-${randomUUID()}`,category:'coding_tests',status:'not_run',details:blocking.join(' '),inputHashes:prepared.snapshots.map(s=>({path:s.path,sha256:s.sha256}))},call);return{status:'blocked',reasons:blocking,planSha256:prepared.planSha256,executed:false};}
  await call.confirm('Compile and test trusted assignment code',`${JSON.stringify(preview,null,2)}\nRun ${input.cases.length} declared test cases. This uses your Windows account, with a separate working copy and bounded execution, but no OS filesystem/network sandbox. No software installation is performed. Source data and outputs may be accessed by the approved code.`);
  assertActive(ctx,call);
  const current=await prepare(ctx,input,call);if(current.planSha256!==prepared.planSha256)throw new Error('Coding inputs changed during approval; run a fresh preview.');
  if((await nativeCapabilities(ctx,call)).elevated)throw new Error('Elevated coding execution is prohibited.');
  await ctx.paths.check(prepared.working,'write');await fs.mkdir(prepared.working);
  for(const source of prepared.snapshots){assertActive(ctx,call);const original=await checkedFile(ctx,source.path,call.signal);const content=original.buffer;if(original.sha256!==source.sha256)throw new Error('Source changed before working-copy creation.');const target=await ctx.paths.check(path.join(prepared.working,source.relativePath),'write');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content,{flag:'wx',signal:call.signal});}
  const started=Date.now(),deadline=started+Math.min(60000,Math.max(1000,ctx.config.toolTimeoutMs-3000));
  let compilation:Execution|undefined;const cases:Record<string,unknown>[]=[];let compilePassed=true;let workingCopySourcesUnchanged=true;
  if(prepared.compile){compilation=await executeFixed(ctx,prepared.compile,prepared.working,'',Math.min(input.timeoutMs,Math.max(100,deadline-Date.now())),call);compilePassed=compilation.exitCode===0&&!compilation.timedOut&&!compilation.outputLimitExceeded;}
  const artifactHashes=compilePassed?await executedFiles(ctx,prepared.run,prepared.working,call):[];
  if(compilePassed){for(const item of input.cases){assertActive(ctx,call);const copied=await workingHashes(ctx,prepared.working,prepared.snapshots,call);if(copied.some((file,index)=>file.sha256!==prepared.snapshots[index].sha256)){workingCopySourcesUnchanged=false;cases.push({name:item.name,status:'not_run',reason:'A working-copy source changed after snapshot.'});continue;}if(deadline-Date.now()<100){cases.push({name:item.name,status:'not_run',reason:'Total run budget exhausted.'});continue;}const currentArtifacts=await executedFiles(ctx,prepared.run,prepared.working,call);if(JSON.stringify(currentArtifacts)!==JSON.stringify(artifactHashes)){cases.push({name:item.name,status:'not_run',reason:'An executed artifact changed between test cases.'});continue;}const result=await executeFixed(ctx,prepared.run,prepared.working,item.stdin,Math.min(input.timeoutMs,deadline-Date.now()),call);const passed=!result.timedOut&&!result.outputLimitExceeded&&result.exitCode===item.expectedExitCode&&normalize(result.stdout,item.comparison)===normalize(item.expectedStdout,item.comparison);cases.push({name:item.name,status:passed?'passed':'failed',stdinSha256:hash(item.stdin),expectedStdoutSha256:hash(item.expectedStdout),expectedExitCode:item.expectedExitCode,comparison:item.comparison,executedFiles:currentArtifacts,...result,stdout:redacted(result.stdout),stderr:redacted(result.stderr)});}}
  else for(const item of input.cases)cases.push({name:item.name,status:'not_run',reason:'Compilation failed.'});
  const unchanged=await Promise.all(prepared.snapshots.map(async source=>(await checkedFile(ctx,source.path,call.signal)).sha256===source.sha256));
  const commandsUnchanged=hash(JSON.stringify([...(input.compileCommandId?[configured(ctx,input.compileCommandId)]:[]),configured(ctx,input.runCommandId)]))===prepared.plan.commandSha256;
  const copied=await workingHashes(ctx,prepared.working,prepared.snapshots,call);workingCopySourcesUnchanged=workingCopySourcesUnchanged&&copied.every((file,index)=>file.sha256===prepared.snapshots[index].sha256);
  const executedArtifactsUnchanged=!compilePassed||JSON.stringify(await executedFiles(ctx,prepared.run,prepared.working,call))===JSON.stringify(artifactHashes);
  const passed=compilePassed&&cases.length===input.cases.length&&cases.every(item=>item.status==='passed')&&unchanged.every(Boolean)&&commandsUnchanged&&workingCopySourcesUnchanged&&executedArtifactsUnchanged;
  const testsStatus=passed?'passed':'failed';const status=passed?(input.restrictions.length?'needs_review':'passed'):'failed';
  const report={id:randomUUID(),category:'coding_tests',status,testsStatus,createdAt:new Date().toISOString(),language:input.language,planSha256:prepared.planSha256,commandSha256:prepared.plan.commandSha256,casesSha256:prepared.plan.casesSha256,sources:prepared.snapshots,commands:prepared.plan.commands,workingDirectory:prepared.working,isolation:{backend:'none',workingCopyOnly:true,networkEnforced:false,filesystemSandbox:false,elevated:false},compilation:compilation?{...compilation,stdout:redacted(compilation.stdout),stderr:redacted(compilation.stderr)}:null,cases,sourceHashesUnchanged:unchanged.every(Boolean),workingCopySourcesUnchanged,executedArtifactsUnchanged,executedFiles:artifactHashes,commandsUnchanged,restrictions:input.restrictions,restrictionReviewRequired:input.restrictions.length>0,durationMs:Date.now()-started,note:'Passing declared tests is evidence for these cases only; it does not prove all assignment requirements or algorithm correctness.'};
  assertActive(ctx,call);const reportPath=await ctx.paths.check(path.join(prepared.working,'coding-verification.json'),'write');await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',signal:call.signal});
  if(input.taskId){
   const inputHashes=[...prepared.snapshots.map(s=>({path:s.path,sha256:s.sha256})),...(passed?[...copied,...artifactHashes]:[])];
   await recordTaskEvidence(ctx,input.taskId,{id:report.id,category:'coding_tests',status:testsStatus,details:`${cases.filter(item=>item.status==='passed').length}/${cases.length} declared cases passed; sources unchanged=${report.sourceHashesUnchanged}; copied sources unchanged=${workingCopySourcesUnchanged}.`,inputHashes,artifactPaths:[reportPath]},call);
   if(input.restrictions.length)await recordTaskEvidence(ctx,input.taskId,{id:`${report.id}-restrictions`,category:'assignment_restrictions',status:'needs_review',details:`Independently review these stated restrictions: ${input.restrictions.join(' ')}`,inputHashes,artifactPaths:[reportPath]},call);
  }
  return{...report,reportPath};
  };return input.taskId?withTaskWork(ctx,input.taskId,call,work):work(call);
 }}
];}
