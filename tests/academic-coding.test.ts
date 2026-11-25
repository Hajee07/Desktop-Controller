import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { codingTools } from '../src/academic/coding/index.js';
import { AuthorizedPaths } from '../src/security/paths.js';
import { ProcessRunner } from '../src/utils/process.js';
import { orchestrationTools } from '../src/academic/orchestration/index.js';
import { taskStore,freshness } from '../src/academic/orchestration/store.js';
import type { AppContext,CallContext,ToolDefinition } from '../src/server/types.js';

const nodeCommand=(args:string[])=>({executable:process.execPath,args,description:'Run only the explicitly trusted synthetic test fixture',requiresConfirmation:true,allowNetwork:false});
async function fixture(t:any,{nativeReal=false,elevated=false}:{nativeReal?:boolean;elevated?:boolean}={}){
 const parent=path.resolve('test-results');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'academic-coding-'));const project=path.join(root,'project');await fs.mkdir(project);const state=path.join(root,'server-state');await fs.mkdir(state);const runner=new ProcessRunner();const shutdowns:(()=>Promise<void>)[]=[];let approvals=0,nativeCalls=0;
 t.after(async()=>{await runner.stop();for(const close of shutdowns)await close();assert.equal(path.dirname(await fs.realpath(root)),parent);await fs.rm(root,{recursive:true,force:true});});
 const ctx={projectDir:process.cwd(),config:{stateDir:state,maxReadBytes:5_000_000,toolTimeoutMs:30000,commands:{run:nodeCommand(['main.cjs']),compile:nodeCommand(['compile.cjs'])}},paths:new AuthorizedPaths([root]),emergency:{assertRunning(){},onStop(fn:()=>Promise<void>){shutdowns.push(fn);}},runProcess:async(exe:string,args:string[],opts:any)=>{
  nativeCalls++;if(!nativeReal&&args.includes('capabilities'))return{stdout:JSON.stringify({platform:'win32',elevated,word:{available:false},ocr:{available:false,languages:[]},commands:{}}),stderr:'',exitCode:0};
  return runner.run(exe,args,opts);
 }} as unknown as AppContext;
 const call:CallContext={signal:new AbortController().signal,confirm:async()=>{approvals++;}};
 const tools=codingTools(ctx),tool=tools.find(item=>item.name==='academic_coding_test')!;
 const main=path.join(project,'main.cjs');await fs.writeFile(main,"const fs=require('node:fs'); const xs=fs.readFileSync(0,'utf8').trim().split(/\\s+/).filter(Boolean).map(Number); console.log(xs.reduce((a,b)=>a+b,0));\n");
 const input=(name='run')=>({project,workingDirectory:path.join(root,name),sources:[{path:main,relativePath:'main.cjs'}],language:'javascript',runCommandId:'run',trustedCode:true,cases:[{name:'positive',stdin:'2 3\n',expectedStdout:'5\n'},{name:'negative and zero',stdin:'-3 3 0\n',expectedStdout:'0\n'}],timeoutMs:2000});
 const invoke=async(data:any,c=call)=>await tool.execute(tool.schema.parse(data),c) as any;
 return{root,project,ctx,call,tools,tool,main,input,invoke,get approvals(){return approvals;},get nativeCalls(){return nativeCalls;}};
}

test('Coding preview hashes actual sources/commands/cases without running or copying code',async t=>{
 const f=await fixture(t);const preview=await f.invoke(f.input());assert.equal(preview.dryRun,true);assert.match(preview.planSha256,/^[a-f0-9]{64}$/);assert.equal(preview.sources.length,1);assert.equal(preview.isolation.filesystemSandbox,false);assert.equal(f.nativeCalls,0);assert.equal(f.approvals,0);await assert.rejects(fs.stat(f.input().workingDirectory));
 assert.throws(()=>f.tool.schema.parse({...f.input(),executable:process.execPath,args:['--eval','arbitrary code']}));
 await assert.rejects(f.invoke({...f.input(),runCommandId:'unconfigured'}),/COMMAND_DENIED/);
 await assert.rejects(f.invoke({...f.input(),language:'python'}),/language/);
 await assert.rejects(f.invoke({...f.input(),sources:[{path:f.main,relativePath:'..\\escape.js'}]}),/relative/);
 await assert.rejects(f.invoke({...f.input(),dryRun:false}),/preview plan/);
 await fs.appendFile(f.main,'// source changed\n');
 await assert.rejects(f.invoke({...f.input(),dryRun:false,expectedPlanSha256:preview.planSha256}),/changed/);
});

test('Untrusted and elevated execution is blocked before copies, commands, or user approvals',async t=>{
 const f=await fixture(t,{elevated:true});const input={...f.input(),trustedCode:false};const preview=await f.invoke(input);const result=await f.invoke({...input,dryRun:false,expectedPlanSha256:preview.planSha256});
 assert.equal(result.status,'blocked');assert.equal(result.executed,false);assert.ok(result.reasons.some((reason:string)=>/Untrusted/.test(reason)));assert.ok(result.reasons.some((reason:string)=>/elevated/.test(reason)));assert.equal(f.approvals,0);await assert.rejects(fs.stat(input.workingDirectory));
});

test('Actual Windows capability check never runs coding fixtures through an elevated production token',async t=>{
 if(process.platform!=='win32')return t.skip('Native Windows token test.');
 const f=await fixture(t,{nativeReal:true});const capabilities=await f.tools.find(item=>item.name==='academic_coding_capabilities')!.execute({},f.call) as any;
 assert.equal(typeof capabilities.elevated,'boolean');assert.equal(capabilities.isolation.backend,'none');
 const input={...f.input(),trustedCode:false};const preview=await f.invoke(input);const result=await f.invoke({...input,dryRun:false,expectedPlanSha256:preview.planSha256});assert.equal(result.status,'blocked');assert.equal(result.executed,false);assert.equal(f.approvals,0);
 if(capabilities.elevated)assert.ok(result.reasons.some((reason:string)=>/elevated/.test(reason)));
});

test('Trusted synthetic Node compile/run mechanics use real processes and stdin; native token response is stubbed for this unit test',async t=>{
 const f=await fixture(t);const compiler=path.join(f.project,'compile.cjs');await fs.writeFile(compiler,"require('node:fs').copyFileSync('main.cjs','compiled.cjs');\n");
 f.ctx.config.commands.run=nodeCommand(['compiled.cjs']);const input={...f.input(),compileCommandId:'compile',sources:[...f.input().sources,{path:compiler,relativePath:'compile.cjs'}]};
 const preview=await f.invoke(input);const result=await f.invoke({...input,dryRun:false,expectedPlanSha256:preview.planSha256});
 assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(result.compilation.exitCode,0);assert.equal(result.cases.length,2);assert.ok(result.cases.every((item:any)=>item.status==='passed'));assert.equal(result.sourceHashesUnchanged,true);assert.equal(result.workingCopySourcesUnchanged,true);assert.equal(result.executedArtifactsUnchanged,true);assert.equal(f.approvals,1);
 assert.ok(result.executedFiles.some((item:any)=>item.path.endsWith('compiled.cjs')));
 const report=JSON.parse(await fs.readFile(result.reportPath,'utf8'));assert.equal(report.planSha256,preview.planSha256);assert.equal(report.isolation.backend,'none');assert.ok(!JSON.stringify(report).includes('"stdin":'));assert.ok(report.cases[0].stdinSha256);assert.ok(report.cases[0].expectedStdoutSha256);
 await assert.rejects(f.invoke(input),/must be new/);
});

test('Trusted synthetic Python case mechanics use real Python; token response is stubbed, restrictions require review',async t=>{
 const f=await fixture(t);const python=process.env.ACADEMIC_TEST_PYTHON??'C:\\Program Files\\Python313\\python.exe';
 if(!await fs.stat(python).then(()=>true,()=>false))return t.skip('Python is not installed; tests never install it.');
 const source=path.join(f.project,'main.py');await fs.writeFile(source,'import sys\nprint(sum(int(x) for x in sys.stdin.read().split()))\n');
 f.ctx.config.commands.python={...nodeCommand(['main.py']),executable:python};const input={...f.input(),language:'python',runCommandId:'python',sources:[{path:source,relativePath:'main.py'}],cases:f.input().cases.map(item=>({...item,comparison:'lines'})),restrictions:['Lecturer requires a loop rather than a built-in aggregate; review implementation.']};
 const preview=await f.invoke(input);const result=await f.invoke({...input,dryRun:false,expectedPlanSha256:preview.planSha256});assert.equal(result.status,'needs_review',JSON.stringify(result));assert.equal(result.restrictionReviewRequired,true);assert.ok(result.cases.every((item:any)=>item.status==='passed'));
});

test('Compilation failure, output mismatch, and process timeout produce failed real verification',async t=>{
 const f=await fixture(t);const compiler=path.join(f.project,'compile.cjs');await fs.writeFile(compiler,"console.error('fixture compile error');process.exit(2);\n");
 const badCompile={...f.input('compile-fail'),compileCommandId:'compile',sources:[...f.input().sources,{path:compiler,relativePath:'compile.cjs'}]};let preview=await f.invoke(badCompile);let result=await f.invoke({...badCompile,dryRun:false,expectedPlanSha256:preview.planSha256});assert.equal(result.status,'failed');assert.equal(result.compilation.exitCode,2);assert.ok(result.cases.every((item:any)=>item.status==='not_run'));
 const mismatch={...f.input('mismatch'),cases:[{name:'wrong expected output',stdin:'2 3',expectedStdout:'6\n'}]};preview=await f.invoke(mismatch);result=await f.invoke({...mismatch,dryRun:false,expectedPlanSha256:preview.planSha256});assert.equal(result.status,'failed');assert.equal(result.cases[0].stdout,'5\n');
 await fs.writeFile(f.main,'setInterval(()=>{},1000);\n');const timeout={...f.input('timeout'),timeoutMs:200,cases:[{name:'must time out',stdin:'',expectedStdout:''}]};preview=await f.invoke(timeout);result=await f.invoke({...timeout,dryRun:false,expectedPlanSha256:preview.planSha256});assert.equal(result.status,'failed');assert.equal(result.cases[0].timedOut,true);
});

test('Changed approvals, missing compiler and working-copy mutation never become passed evidence',async t=>{
 const f=await fixture(t);const input=f.input('approval-race');const preview=await f.invoke(input);
 const mutating:CallContext={...f.call,confirm:async()=>{await fs.appendFile(f.main,'// changed while user reviewed\n');}};
 await assert.rejects(f.invoke({...input,dryRun:false,expectedPlanSha256:preview.planSha256},mutating),/changed during approval/);await assert.rejects(fs.stat(input.workingDirectory));
 const cfile=path.join(f.project,'main.c');await fs.writeFile(cfile,'int main(void){return 0;}\n');f.ctx.config.commands.missing={...nodeCommand(['main.c']),executable:path.join(f.root,'missing-compiler.exe')};
 const missing={...f.input('missing'),language:'c',compileCommandId:'missing',sources:[{path:cfile,relativePath:'main.c'}]};let p=await f.invoke(missing);assert.ok(p.unavailable.length);const blocked=await f.invoke({...missing,dryRun:false,expectedPlanSha256:p.planSha256});assert.equal(blocked.status,'blocked');
 await fs.writeFile(f.main,"require('node:fs').appendFileSync('main.cjs','// mutated\\n');console.log('ok');\n");const mutation={...f.input('mutation'),cases:[{name:'self modification',stdin:'',expectedStdout:'ok\n'}]};p=await f.invoke(mutation);const report=await f.invoke({...mutation,dryRun:false,expectedPlanSha256:p.planSha256});assert.equal(report.status,'failed');assert.equal(report.workingCopySourcesUnchanged,false);
});

test('Coding child environment excludes inherited secrets and output reports redact secret-shaped values',async t=>{
 const f=await fixture(t);const previous=process.env.ACADEMIC_TEST_SECRET;process.env.ACADEMIC_TEST_SECRET='fixture-never-forward';t.after(()=>{if(previous===undefined)delete process.env.ACADEMIC_TEST_SECRET;else process.env.ACADEMIC_TEST_SECRET=previous;});
 await fs.writeFile(f.main,"console.log(String(process.env.ACADEMIC_TEST_SECRET));console.error('token=fixture-output-token');\n");const input={...f.input(),cases:[{name:'environment',stdin:'',expectedStdout:'undefined\n'}]};const p=await f.invoke(input);const report=await f.invoke({...input,dryRun:false,expectedPlanSha256:p.planSha256});assert.equal(report.status,'passed');assert.equal(report.cases[0].stderr,'token=[REDACTED]\n');assert.ok(!JSON.stringify(report).includes('fixture-never-forward'));assert.ok(!JSON.stringify(report).includes('fixture-output-token'));
});

test('Computed coding evidence is bound to real sources/copies/artifacts and task cancellation stops owned work',async t=>{
 const f=await fixture(t);const tasks=orchestrationTools(f.ctx),create=tasks.find(item=>item.name==='academic_task_create')!;
 const created=await create.execute(create.schema.parse({description:'Verify the declared synthetic addition cases.',kind:'coding',inputFiles:[f.main],requiresCitations:false}),f.call) as any;
 const input={...f.input('evidence'),taskId:created.task.id,restrictions:['Use only addition; independently review the implementation.']};const p=await f.invoke(input);const report=await f.invoke({...input,dryRun:false,expectedPlanSha256:p.planSha256});assert.equal(report.status,'needs_review');assert.equal(report.testsStatus,'passed');
 const store=await taskStore(f.ctx),task=store.load(created.task.id);const evidence=task.evidence.find(item=>item.id===report.id)!;assert.equal(evidence.origin,'computed');assert.equal(evidence.status,'passed');assert.ok(task.evidence.some(item=>item.category==='assignment_restrictions'&&item.status==='needs_review'));assert.ok(evidence.artifacts.some(item=>item.path===report.reportPath));assert.ok(evidence.inputHashes.some(item=>item.path.startsWith(input.workingDirectory)));
 await fs.appendFile(path.join(input.workingDirectory,'main.cjs'),'// changed after tests\n');assert.equal((await freshness(f.ctx,evidence.inputHashes,f.call)).fresh,false);

 await fs.writeFile(f.main,"require('node:fs').writeFileSync('started.txt',String(process.pid));setInterval(()=>{},1000);\n");const second=await create.execute(create.schema.parse({description:'Cancel the owned synthetic fixture.',kind:'coding',inputFiles:[f.main],requiresCitations:false}),f.call) as any;
 const pending={...f.input('cancelled'),taskId:second.task.id,timeoutMs:10000,cases:[{name:'cancel me',stdin:'',expectedStdout:''}]};const plan=await f.invoke(pending);let failure:unknown;const execution=f.invoke({...pending,dryRun:false,expectedPlanSha256:plan.planSha256});execution.catch(error=>{failure=error;});const marker=path.join(pending.workingDirectory,'started.txt');let pid=0;
 for(let i=0;i<400&&!pid;i++){if(failure)throw failure;pid=await fs.readFile(marker,'utf8').then(value=>Number(value),()=>0);if(!pid)await new Promise(resolve=>setTimeout(resolve,10));}
 assert.ok(pid>0);const cancel=tasks.find(item=>item.name==='academic_task_cancel')!;await cancel.execute(cancel.schema.parse({taskId:second.task.id,reason:'Synthetic cancellation'}),f.call);await assert.rejects(execution,/cancel/i);assert.equal(store.load(second.task.id).status,'cancelled');assert.throws(()=>process.kill(pid,0));
});
