import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { orchestrationTools,analyzeInstructions } from '../src/academic/orchestration/index.js';
import { reasoningTools } from '../src/academic/reasoning/index.js';
import { taskStore,validateDag,withTaskWork,recordTaskEvidence } from '../src/academic/orchestration/store.js';
import { AuthorizedPaths } from '../src/security/paths.js';
import { sha256 } from '../src/academic/common.js';
import { renderReport } from '../src/filesystem/documents.js';
import type { AppContext, CallContext } from '../src/server/types.js';

const call:CallContext={signal:new AbortController().signal,confirm:async()=>{throw new Error('Academic fixture must not request GUI/irreversible actions.');}};
async function fixture(){
  const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'academic-tasks-'));const workspace=path.join(dir,'workspace'),state=path.join(dir,'.state');await fs.mkdir(workspace);await fs.mkdir(state);const source=path.join(workspace,'lecture.txt');await fs.writeFile(source,'Voltage equals current multiplied by resistance.\nMeasured voltage: 5.0 V.\n');
  const hooks:(()=>Promise<void>)[]=[];
  function context():AppContext{return{projectDir:dir,config:{stateDir:state,authorizedRoots:[workspace],maxReadBytes:5_000_000,toolTimeoutMs:10000} as any,paths:new AuthorizedPaths([workspace],[state]),emergency:{assertRunning(){},onStop(fn){hooks.push(fn);},async stop(){for(const fn of hooks)await fn();}},audit:{record(){},list(){return[];}},backup:async()=>null,runPowerShell:async()=>{throw new Error('No GUI');},runProcess:async()=>{throw new Error('No implicit process execution');}};}
  const ctx=context();const tools=[...orchestrationTools(ctx),...reasoningTools(ctx)];const run=async(name:string,args:any,c=call)=>{const tool=tools.find(t=>t.name===name);assert.ok(tool,name);return await tool.execute(tool.schema.parse(args),c) as any;};
  return{base,dir,workspace,state,source,ctx,context,run,async close(){for(const fn of hooks.reverse())await fn();assert.equal(path.dirname(await fs.realpath(dir)),base);await fs.rm(dir,{recursive:true,force:true});}};
}
async function createPlan(f:Awaited<ReturnType<typeof fixture>>,kind='assignment',steps:any[]=[{id:'analyze',description:'Read and answer the reviewed question',kind:'analysis'},{id:'write',description:'Generate the output artifact',kind:'generation',dependencies:['analyze'],effect:'local_files'}],deliverables=['report.txt']){
  const created=await f.run('academic_task_create',{description:'Explain the supplied lecture topic',instructions:'1. Explain the voltage relationship [5 marks].\nUse a DOCX report with references.',inputFiles:[f.source],kind});const task=created.task;
  const plan=await f.run('academic_task_plan',{taskId:task.id,expectedRevision:task.revision,questions:[{id:'q1',text:'Explain the voltage relationship.',marks:5,commandWord:'explain',depthGuidance:'Explain the relationship using the supplied lecture.'}],formatting:['Use lecture references.'],deliverables,steps,requirementsReviewed:true});return{taskId:task.id,revision:plan.revision};
}
async function answerAndWrite(f:Awaited<ReturnType<typeof fixture>>,taskId:string,revision:number){
  let started=await f.run('academic_task_step_start',{taskId,expectedRevision:revision,stepId:'analyze'});const prepared=await f.run('academic_reasoning_prepare',{taskId,expectedRevision:started.revision,stepId:'analyze'});const source=prepared.packet.sources[0],segment=source.segments[0];
  const result={answers:[{questionId:'q1',answerPlan:['State the relationship and explain each term.'],explanation:'Voltage equals current multiplied by resistance.',citations:[{sourceId:source.sourceId,segmentId:segment.id,quotedText:'Voltage equals current multiplied by resistance.'}],classification:'theoretical'}],verificationNotes:['The source supports this relationship; host accuracy review remains separate.']};
  const committed=await f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:prepared.revision,result});
  let checkpoint=await f.run('academic_task_checkpoint',{taskId,expectedRevision:committed.revision,stepId:'analyze',status:'completed',summary:'The host prepared a grounded answer with valid citation provenance.'});started=await f.run('academic_task_step_start',{taskId,expectedRevision:checkpoint.revision,stepId:'write'});
  const output=path.join(f.workspace,'report.txt');await fs.writeFile(output,'Voltage equals current multiplied by resistance.\nSource: supplied lecture.\n');checkpoint=await f.run('academic_task_checkpoint',{taskId,expectedRevision:started.revision,stepId:'write',status:'completed',summary:'Created a real fixture output file.',artifacts:[{path:output,role:'final'}]});return{revision:checkpoint.revision,output,prepared,result};
}
async function reviews(f:Awaited<ReturnType<typeof fixture>>,taskId:string,revision:number){for(const category of ['technical_accuracy','layout_review']){const result=await f.run('academic_task_host_review',{taskId,expectedRevision:revision,category,status:'passed',details:'Explicit host review of this isolated fixture; this is labeled host-reported.'});revision=result.revision;}return revision;}

test('instruction analysis preserves explicit marks and uncertainty; DAGs reject cycles, duplicate and unknown IDs',()=>{
  const analysis=analyzeInstructions('1. Define voltage [2 marks].\n2. Compare two methods.\nUse Arial 11pt with IEEE references.');assert.equal(analysis.questions[0].marks,2);assert.equal(analysis.questions[1].marks,null);assert.match(analysis.questions[1].depthGuidance,/not explicitly/);assert.ok(analysis.formatting.some(x=>x.includes('Arial')));
  assert.throws(()=>validateDag([{id:'a',dependencies:[]},{id:'a',dependencies:[]}]),/duplicate/);assert.throws(()=>validateDag([{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}]),/cycle/);assert.throws(()=>validateDag([{id:'a',dependencies:['missing']}]),/unknown/);
});

test('tasks persist revisions, grounded reasoning, real artifacts, independent host reviews, and strict final freshness',async()=>{
  const f=await fixture();try{
    const capabilities=await f.run('academic_reasoning_capabilities',{});assert.equal(capabilities.providers[0].automaticGeneration,false);let task=await createPlan(f);
    await assert.rejects(f.run('academic_task_step_start',{taskId:task.taskId,expectedRevision:1,stepId:'analyze'}),/REVISION_CONFLICT/);
    const completed=await answerAndWrite(f,task.taskId,task.revision);let revision=await reviews(f,task.taskId,completed.revision);const verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:revision});assert.equal(verified.readyToFinalize,true);
    await fs.appendFile(completed.output,'changed');await assert.rejects(f.run('academic_task_finalize',{taskId:task.taskId,expectedRevision:verified.revision}),/changed/);await fs.writeFile(completed.output,'Voltage equals current multiplied by resistance.\nSource: supplied lecture.\n');
    const final=await f.run('academic_task_finalize',{taskId:task.taskId,expectedRevision:verified.revision});assert.equal(final.status,'completed');assert.equal(final.files[0].path,completed.output);
    const saved=await f.run('academic_reasoning_get',{requestId:completed.prepared.packet.requestId});assert.equal(saved.status,'committed');assert.equal(saved.result.answers.length,1);
    const store=await taskStore(f.ctx);store.close();const restarted=f.context();const loaded=(await taskStore(restarted)).load(task.taskId);assert.equal(loaded.status,'completed');assert.equal(loaded.answers[0].questionId,'q1');
  }finally{await f.close();}
});

test('reasoning rejects fabricated citations/quotes/measurements, changed sources, duplicate answers, and replay',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f);const prepared=await f.run('academic_reasoning_prepare',{taskId:task.taskId,expectedRevision:task.revision});const src=prepared.packet.sources[0],seg=src.segments[0];
    const good={questionId:'q1',answerPlan:['Explain using the lecture.'],explanation:'The lecture explains voltage.',classification:'theoretical',citations:[{sourceId:src.sourceId,segmentId:seg.id}]};
    await assert.rejects(f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:prepared.revision,result:{answers:[{...good,citations:[{sourceId:src.sourceId,segmentId:'seg_'+'0'.repeat(16)}]}]}}),/Unknown citation/);
    await assert.rejects(f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:prepared.revision,result:{answers:[{...good,citations:[{sourceId:src.sourceId,segmentId:seg.id,quotedText:'This quote was invented.'}]}]}}),/quote/);
    await assert.rejects(f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:prepared.revision,result:{answers:[{...good,classification:'supplied_observation',observationNames:['fictional']} ]}}),/measurements/);
    await assert.rejects(f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:prepared.revision,result:{answers:[good,good]}}),/exactly one/);
    const commit=await f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:prepared.revision,result:{answers:[good]}});await assert.rejects(f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:commit.revision,result:{answers:[good]}}),/replay/);
    await fs.appendFile(f.source,'New source revision.');await assert.rejects(f.run('academic_reasoning_get',{requestId:prepared.packet.requestId}),/stale/);
  }finally{await f.close();}
});

test('source/artifact invalidation prevents reusing obsolete checkpoints and resumes with fresh reviewed requirements',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f);const completed=await answerAndWrite(f,task.taskId,task.revision);const reuse=await f.run('academic_task_step_start',{taskId:task.taskId,expectedRevision:completed.revision,stepId:'write'});assert.equal(reuse.reused,true);
    await fs.appendFile(completed.output,'Changed output');const verification=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:completed.revision});assert.equal(verification.readyToFinalize,false);const view=await f.run('academic_task_get',{taskId:task.taskId});assert.equal(view.steps.find((s:any)=>s.id==='write').status,'stale');
    await fs.appendFile(f.source,'Changed lecture');await assert.rejects(f.run('academic_task_resume',{taskId:task.taskId,expectedRevision:verification.revision}),/refreshSources/);const resumed=await f.run('academic_task_resume',{taskId:task.taskId,expectedRevision:verification.revision,refreshSources:true});assert.equal(resumed.status,'draft');assert.equal((await f.run('academic_task_get',{taskId:task.taskId})).answers.length,0);
  }finally{await f.close();}
});

test('restart recovers running checkpoints and cancellation aborts bounded task work without replaying external actions',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f,'assignment',[{id:'read',description:'Read a source',kind:'analysis'},{id:'other',description:'Independent read',kind:'analysis'},{id:'third',description:'Third independent read',kind:'analysis'}]);assert.equal((await f.run('academic_task_get',{taskId:task.taskId})).readySteps.length,2);
    const started=await f.run('academic_task_step_start',{taskId:task.taskId,expectedRevision:task.revision,stepId:'read'});const parallel=await f.run('academic_task_step_start',{taskId:task.taskId,expectedRevision:started.revision,stepId:'other'});const awaiting=await f.run('academic_reasoning_prepare',{taskId:task.taskId,expectedRevision:parallel.revision,stepId:'other'});assert.equal((await f.run('academic_task_get',{taskId:task.taskId})).status,'running');assert.equal(awaiting.packet.status,'awaiting_host_reasoning');(await taskStore(f.ctx)).close();const ctx2=f.context(),store2=await taskStore(ctx2);let loaded=store2.load(task.taskId);assert.equal(loaded.status,'interrupted');assert.equal(loaded.steps[0].status,'interrupted');
    const tools=orchestrationTools(ctx2),run=async(name:string,args:any)=>{const t=tools.find(t=>t.name===name)!;return t.execute(t.schema.parse(args),call) as Promise<any>;};
    const work=withTaskWork(ctx2,task.taskId,call,async c=>new Promise<void>((_resolve,reject)=>c.signal.addEventListener('abort',()=>reject(new Error('work aborted')),{once:true})));const cancelled=await run('academic_task_cancel',{taskId:task.taskId});await assert.rejects(work,/aborted/);assert.equal(cancelled.status,'cancelled');const resumed=await run('academic_task_resume',{taskId:task.taskId,expectedRevision:cancelled.revision});assert.equal(resumed.status,'awaiting_host');
    // A separate context is used because f.ctx was deliberately closed to emulate a restart.
    const t=store2.load(task.taskId);t.steps[0].effect='external';t.steps[0].status='running';t.steps[0].owner='abandoned-process-instance';t.steps[0].leaseExpires=1;t.status='running';store2.save(t,t.revision,'fixture_abandoned_lease');store2.close();const ctx3=f.context(),store3=await taskStore(ctx3);loaded=store3.load(task.taskId);assert.equal(loaded.steps[0].status,'awaiting_host');assert.match(loaded.steps[0].warning!,/external|effects/i);assert.equal(loaded.status,'interrupted');
    assert.ok(started.revision>task.revision);
  }finally{await f.close();}
});

test('laboratory completion blocks missing observations and rejects invented values; coding evidence stays hash-bound',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f,'lab_report');const completed=await answerAndWrite(f,task.taskId,task.revision);let revision=await reviews(f,task.taskId,completed.revision);let verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:revision});assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('measurements')));await assert.rejects(f.run('academic_task_finalize',{taskId:task.taskId,expectedRevision:verified.revision}),/blockers/);
    const sourceHash=sha256(await fs.readFile(f.source));await assert.rejects(f.run('academic_task_observations',{taskId:task.taskId,expectedRevision:verified.revision,observations:[{name:'voltage',value:'987654321',sourcePath:f.source,expectedSha256:sourceHash}]}),/not present/);
    const observed=await f.run('academic_task_observations',{taskId:task.taskId,expectedRevision:verified.revision,observations:[{name:'voltage',value:'5.0',unit:'V',sourcePath:f.source,expectedSha256:sourceHash}]});assert.equal(observed.count,1);assert.equal((await f.run('academic_task_get',{taskId:task.taskId})).steps[0].status,'stale');
    await assert.rejects(recordTaskEvidence(f.ctx,task.taskId,{id:'test',category:'coding_tests',status:'passed',details:'Fixture evidence',inputHashes:[{path:f.source,sha256:'0'.repeat(64)}]},call),/changed/);const recorded=await recordTaskEvidence(f.ctx,task.taskId,{id:'actual_metadata',category:'coding_tests',status:'not_run',details:'No code execution occurred in this metadata fixture.',inputHashes:[{path:f.source,sha256:sourceHash}]},call);assert.equal(recorded.evidenceId,'actual_metadata');assert.equal((await f.run('academic_task_get',{taskId:task.taskId})).evidence.find((e:any)=>e.id==='actual_metadata').origin,'computed');
  }finally{await f.close();}
});

test('task folders are cursor-free and inert in preview; secrets and revoked paths fail closed',async()=>{
  const f=await fixture();try{
    const preview=await f.run('academic_task_folders',{base:f.workspace,subject:'Physics',assignment:'Lab_01'});assert.equal(preview.dryRun,true);await assert.rejects(fs.stat(preview.root));const made=await f.run('academic_task_folders',{base:f.workspace,subject:'Physics',assignment:'Lab_01',dryRun:false});assert.equal((await fs.stat(path.join(made.root,'Final'))).isDirectory(),true);
    await assert.rejects(f.run('academic_task_create',{description:'password=SHOULD_NOT_PERSIST',inputFiles:[f.source]}),/Sensitive/);await assert.rejects(f.run('academic_task_create',{description:'Outside root',inputFiles:[path.join(f.state,'academic','tasks.sqlite')]}),/DENIED/);
    const task=await createPlan(f);const prepared=await f.run('academic_reasoning_prepare',{taskId:task.taskId,expectedRevision:task.revision});f.ctx.paths=new AuthorizedPaths([]);await assert.rejects(f.run('academic_reasoning_get',{requestId:prepared.packet.requestId}),/stale/);const view=await f.run('academic_task_get',{taskId:task.taskId});assert.equal(view.inputFiles[0].path,'[no longer authorized]');
  }finally{await f.close();}
});

test('host reviews become stale after replaced final artifacts; QC reports preserve blockers and redact revoked references',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f);const completed=await answerAndWrite(f,task.taskId,task.revision);let revision=await reviews(f,task.taskId,completed.revision);let verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:revision});assert.equal(verified.readyToFinalize,true);
    await fs.appendFile(completed.output,'A changed answer requires a new host review.');verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:verified.revision});const start=await f.run('academic_task_step_start',{taskId:task.taskId,expectedRevision:verified.revision,stepId:'write'});const checkpoint=await f.run('academic_task_checkpoint',{taskId:task.taskId,expectedRevision:start.revision,stepId:'write',status:'completed',summary:'Updated fixture artifact.',artifacts:[{path:completed.output,role:'final'}]});verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:checkpoint.revision});assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('technical_accuracy')));
    const jsonPath=path.join(f.workspace,'quality.json');const preview=await f.run('academic_task_quality_report',{taskId:task.taskId,path:jsonPath});assert.equal(preview.dryRun,true);await assert.rejects(fs.stat(jsonPath));await f.run('academic_task_quality_report',{taskId:task.taskId,path:jsonPath,dryRun:false});const report=JSON.parse(await fs.readFile(jsonPath,'utf8'));assert.equal(report.verificationStatus,'blocked_or_needs_review');assert.ok(report.checks.some((c:any)=>c.category==='technical_accuracy'&&c.status==='needs_review'));assert.equal(report.questions[0].answerRecorded,true);assert.ok(report.sourceAndArtifactHashes[0].expectedSha256);
    await assert.rejects(f.run('academic_task_quality_report',{taskId:task.taskId,path:jsonPath,dryRun:false}),/EEXIST/);
    // Retain only the output subfolder as authorized. The original lecture and output answer are revoked.
    const reports=path.join(f.workspace,'Reports');await fs.mkdir(reports);f.ctx.paths=new AuthorizedPaths([reports]);const mdPath=path.join(reports,'revoked.md');await f.run('academic_task_quality_report',{taskId:task.taskId,path:mdPath,format:'md',dryRun:false});const md=await fs.readFile(mdPath,'utf8');assert.doesNotMatch(md,/lecture\.txt|changed answer|Explain the voltage/);assert.match(md,/no longer authorized/);
  }finally{await f.close();}
});

test('coding finalization requires exact tested code bytes and a separate current restriction review',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f,'coding'),program=path.join(f.workspace,'program.py');await fs.writeFile(program,'print(2 + 2)\n');const selected=await f.run('academic_task_sources',{taskId:task.taskId,expectedRevision:task.revision,paths:[program]});const current=(await taskStore(f.ctx)).load(task.taskId);
    const plan=await f.run('academic_task_plan',{taskId:task.taskId,expectedRevision:selected.revision,questions:current.questions,formatting:current.formatting,deliverables:current.deliverables,requirementsReviewed:true,steps:current.steps.map(({id,description,kind,dependencies,tools,effect})=>({id,description,kind,dependencies,tools,effect}))});const completed=await answerAndWrite(f,task.taskId,plan.revision);
    // The evidence helper is an internal trusted-service boundary. This fixture verifies metadata binding; the coding-engine suite verifies actual execution.
    await recordTaskEvidence(f.ctx,task.taskId,{id:'wrong_code_inputs',category:'coding_tests',status:'passed',details:'Fixture attempts to verify unrelated source bytes.',inputHashes:[{path:f.source,sha256:sha256(await fs.readFile(f.source))}]},call);let view=(await taskStore(f.ctx)).load(task.taskId);let revision=await reviews(f,task.taskId,view.revision);let verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:revision});assert.ok(verified.verification.blocking.some((s:string)=>s.includes('execution evidence')));
    await recordTaskEvidence(f.ctx,task.taskId,{id:'matching_code_inputs',category:'coding_tests',status:'passed',details:'Trusted-service metadata fixture for exact code bytes.',inputHashes:[{path:program,sha256:sha256(await fs.readFile(program))}]},call);await recordTaskEvidence(f.ctx,task.taskId,{id:'restrictions',category:'assignment_restrictions',status:'needs_review',details:'The task requires an explicit source-aware restrictions review.',inputHashes:[{path:program,sha256:sha256(await fs.readFile(program))}]},call);view=(await taskStore(f.ctx)).load(task.taskId);verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:view.revision});assert.ok(verified.verification.blocking.some((s:string)=>s.includes('assignment_restrictions')));
    const reviewed=await f.run('academic_task_host_review',{taskId:task.taskId,expectedRevision:verified.revision,category:'assignment_restrictions',status:'passed',details:'The host checked the supplied restrictions against the unchanged fixture source.'});verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:reviewed.revision});assert.equal(verified.readyToFinalize,true);
    await fs.appendFile(program,'print(5)\n');await assert.rejects(f.run('academic_task_finalize',{taskId:task.taskId,expectedRevision:verified.revision}),/changed/);
    assert.ok(completed.output);
  }finally{await f.close();}
});

test('completion enforces actual requested filename/format and committed content despite positive host notes',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f,'assignment',undefined,['report.docx']);const completed=await answerAndWrite(f,task.taskId,task.revision);let revision=await reviews(f,task.taskId,completed.revision);let verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:revision});assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('report.docx')));await assert.rejects(f.run('academic_task_finalize',{taskId:task.taskId,expectedRevision:verified.revision}),/blockers/);
    async function replaceFinal(folder:string,name:string,data:Buffer){
      const dir=path.join(f.workspace,folder);await fs.mkdir(dir);const output=path.join(dir,name);await fs.writeFile(output,data);const current=(await taskStore(f.ctx)).load(task.taskId);const steps=current.steps.map(({id,description,kind,dependencies,tools,effect})=>({id,description:id==='write'?description+' '+folder:description,kind,dependencies,tools,effect}));const planned=await f.run('academic_task_plan',{taskId:task.taskId,expectedRevision:current.revision,questions:current.questions,formatting:current.formatting,deliverables:current.deliverables,steps,requirementsReviewed:true});const started=await f.run('academic_task_step_start',{taskId:task.taskId,expectedRevision:planned.revision,stepId:'write'});const saved=await f.run('academic_task_checkpoint',{taskId:task.taskId,expectedRevision:started.revision,stepId:'write',status:'completed',summary:'Replace a synthetic final artifact for integrity regression.',artifacts:[{path:output,role:'final'}]});const reviewed=await reviews(f,task.taskId,saved.revision);return f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:reviewed});
    }
    verified=await replaceFinal('Malformed','report.docx',Buffer.from('Voltage equals current multiplied by resistance.'));assert.equal(verified.readyToFinalize,false);assert.equal(verified.verification.checks.find((c:any)=>c.category==='artifact_structure').status,'failed');
    const related=await renderReport('docx',{title:'Answer',columns:['Response'],rows:[['Voltage equals current multiplied by resistance.']]});verified=await replaceFinal('Wrong_Name','other.docx',related);assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('report.docx')));
    verified=await replaceFinal('Unrelated','report.docx',await renderReport('docx',{title:'Unrelated file',columns:['Status'],rows:[['No answer was copied into this structurally valid document.']]}));assert.equal(verified.verification.checks.find((c:any)=>c.category==='artifact_structure').status,'passed');assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('complete committed explanation')));
    verified=await replaceFinal('Correct','report.docx',related);assert.equal(verified.readyToFinalize,true,JSON.stringify(verified.verification.blocking));assert.equal((await f.run('academic_task_finalize',{taskId:task.taskId,expectedRevision:verified.revision})).status,'completed');
  }finally{await f.close();}
});

test('ambiguous legacy outputs need reviewed contracts and every question requires mapped full answer content',async()=>{
  const f=await fixture();try{
    const task=await createPlan(f,'assignment',undefined,['A professional report']);const completed=await answerAndWrite(f,task.taskId,task.revision);let revision=await reviews(f,task.taskId,completed.revision);let verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:revision});assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('Ambiguous deliverable')));
    await assert.rejects(f.run('academic_task_deliverables',{taskId:task.taskId,expectedRevision:verified.revision,contracts:[{id:'report',format:'txt',name:'report.txt',questionIds:['invented']}],reviewed:true}),/unknown|no mapped/);
    const explicit=await f.run('academic_task_deliverables',{taskId:task.taskId,expectedRevision:verified.revision,contracts:[{id:'report',format:'txt',name:'report.txt',questionIds:['q1']}],reviewed:true});assert.equal(explicit.answersPreserved,true);const current=(await taskStore(f.ctx)).load(task.taskId);assert.equal(current.answers.length,1);assert.equal(current.steps.find(s=>s.id==='write')!.status,'stale');
    const started=await f.run('academic_task_step_start',{taskId:task.taskId,expectedRevision:explicit.revision,stepId:'write'});const saved=await f.run('academic_task_checkpoint',{taskId:task.taskId,expectedRevision:started.revision,stepId:'write',status:'completed',summary:'Reuse the already-correct artifact under explicit reviewed output mapping.',artifacts:[{path:completed.output,role:'final'}]});verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:saved.revision});assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('technical_accuracy')));assert.equal(verified.verification.checks.find((c:any)=>c.category==='answer_artifact_coverage').status,'passed');
    revision=await reviews(f,task.taskId,verified.revision);verified=await f.run('academic_task_verify',{taskId:task.taskId,expectedRevision:revision});assert.equal(verified.readyToFinalize,true);
  }finally{await f.close();}
});

test('two committed answers cannot be covered by an artifact containing only the first',async()=>{
  const f=await fixture();try{
    await fs.appendFile(f.source,'Resistance is measured in ohms.\n');const created=await f.run('academic_task_create',{description:'Explain two quantities.',inputFiles:[f.source]});const taskId=created.task.id,questions=[{id:'q1',text:'Explain voltage.',marks:2,commandWord:'explain',depthGuidance:'Use the lecture.'},{id:'q2',text:'State resistance units.',marks:1,commandWord:'define',depthGuidance:'State the supplied unit.'}];const planned=await f.run('academic_task_plan',{taskId,expectedRevision:1,questions,deliverables:['report.txt'],requirementsReviewed:true,steps:[{id:'write',description:'Write both answers.',kind:'generation'}]});const started=await f.run('academic_task_step_start',{taskId,expectedRevision:planned.revision,stepId:'write'});const prepared=await f.run('academic_reasoning_prepare',{taskId,expectedRevision:started.revision});const source=prepared.packet.sources[0],segment=source.segments[0];const answers=[{questionId:'q1',answerPlan:['Explain the relationship.'],explanation:'Voltage equals current multiplied by resistance.',classification:'theoretical',citations:[{sourceId:source.sourceId,segmentId:segment.id}]},{questionId:'q2',answerPlan:['State the unit.'],explanation:'Resistance is measured in ohms.',classification:'theoretical',citations:[{sourceId:source.sourceId,segmentId:segment.id}]}];const committed=await f.run('academic_reasoning_commit',{requestId:prepared.packet.requestId,expectedRevision:prepared.revision,result:{answers}});const output=path.join(f.workspace,'report.txt');await fs.writeFile(output,answers[0].explanation);const saved=await f.run('academic_task_checkpoint',{taskId,expectedRevision:committed.revision,stepId:'write',status:'completed',summary:'A deliberately incomplete actual final file.',artifacts:[{path:output,role:'final'}]});const reviewed=await reviews(f,taskId,saved.revision);const verified=await f.run('academic_task_verify',{taskId,expectedRevision:reviewed});assert.equal(verified.verification.checks.find((c:any)=>c.category==='question_coverage').status,'passed');assert.equal(verified.readyToFinalize,false);assert.ok(verified.verification.blocking.some((s:string)=>s.includes('question q2')));
  }finally{await f.close();}
});
