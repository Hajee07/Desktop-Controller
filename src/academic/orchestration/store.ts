import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { AppContext, CallContext } from '../../server/types.js';
import { academicDatabasePath, active, checkedFile, sha256 } from '../common.js';
import { getDocumentIdentity } from '../extraction/index.js';

export type TaskStatus='draft'|'planned'|'running'|'awaiting_host'|'interrupted'|'failed'|'cancelled'|'completed';
export type StepStatus='pending'|'running'|'awaiting_host'|'completed'|'failed'|'cancelled'|'stale'|'interrupted';
export interface FileReference {path:string;sha256:string;canonicalSourceId?:string;role?:string}
export interface Question {id:string;text:string;marks:number|null;commandWord:string|null;depthGuidance:string}
export interface TaskStep {id:string;description:string;kind:'analysis'|'extraction'|'research'|'generation'|'coding'|'verification';dependencies:string[];tools:string[];effect:'read_only'|'local_files'|'external';status:StepStatus;inputDigest?:string;artifacts:FileReference[];checkpoint?:string;owner?:string;leaseExpires?:number;warning?:string}
export interface Observation {name:string;value:string;unit?:string;source:FileReference;location?:string}
export interface TaskEvidence {id:string;category:string;status:'passed'|'failed'|'needs_review'|'not_run';details:string;origin:'computed'|'host_reported';inputHashes:FileReference[];artifacts:FileReference[];createdAt:string;reviewDigest?:string}
export interface AnswerReference {questionId:string;requestId:string;citations:{sourceId:string;segmentId:string}[];classification:'theoretical'|'calculated'|'supplied_observation';observationNames:string[]}
export interface DeliverableContract {id:string;format:string;path?:string;name?:string;questionIds:string[];origin?:'explicit'|'legacy_inferred'}
export interface AcademicTask {id:string;revision:number;description:string;kind:'assignment'|'lab_report'|'coding'|'documentation'|'presentation'|'spreadsheet';subject:string|null;status:TaskStatus;createdAt:string;updatedAt:string;inputFiles:FileReference[];questions:Question[];formatting:string[];deliverables:string[];deliverableContracts?:DeliverableContract[];deliverableContractsReviewed?:boolean;requirementsReviewed:boolean;requiresCitations:boolean;requiresMeasurements:boolean;steps:TaskStep[];observations:Observation[];answers:AnswerReference[];evidence:TaskEvidence[];warnings:string[];verification?:{revision:number;checkedAt:string;checks:TaskEvidence[];blocking:string[]};cancelReason?:string}

export function noSecrets(value:unknown):void{
  const text=typeof value==='string'?value:JSON.stringify(value);
  if(/-----BEGIN (?:\w+ )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+\/-]{12,}|\bsk-[A-Za-z0-9_-]{16,}|\b(?:password|passwd|api[_ -]?key|access[_ -]?token|client[_ -]?secret)\s*[:=]\s*["']?[^\s"']{6,}/i.test(text))throw new Error('Sensitive credential-like data cannot be stored in academic task memory. Reference a source file instead.');
}
export function validateDag(steps:Pick<TaskStep,'id'|'dependencies'>[]):void{
  const ids=new Set<string>();for(const s of steps){if(ids.has(s.id))throw new Error('Plan contains duplicate step IDs.');ids.add(s.id);}
  const byId=new Map(steps.map(s=>[s.id,s]));const complete=new Set<string>(),visiting=new Set<string>();
  function visit(id:string){if(complete.has(id))return;if(visiting.has(id))throw new Error('Plan dependencies contain a cycle.');visiting.add(id);for(const dep of byId.get(id)!.dependencies){if(!ids.has(dep))throw new Error('Plan references an unknown dependency.');visit(dep);}visiting.delete(id);complete.add(id);}
  for(const id of ids)visit(id);
}
export function stepDigest(task:AcademicTask,step:TaskStep):string{
  return sha256(JSON.stringify({inputs:task.inputFiles,observations:task.observations,questions:task.questions,formatting:task.formatting,deliverables:task.deliverables,...(task.deliverableContracts!==undefined&&['generation','coding','verification'].includes(step.kind)?{deliverableContracts:task.deliverableContracts}:{}),step:{id:step.id,description:step.description,kind:step.kind,tools:step.tools,effect:step.effect},dependencies:step.dependencies.map(id=>({id,artifacts:task.steps.find(s=>s.id===id)?.artifacts??[]}))}));
}
export function reviewDigest(task:AcademicTask):string{return sha256(JSON.stringify({inputs:task.inputFiles,questions:task.questions,formatting:task.formatting,deliverables:task.deliverables,...(task.deliverableContracts!==undefined?{deliverableContracts:task.deliverableContracts}:{}),observations:task.observations,answers:task.answers,artifacts:task.steps.map(s=>({id:s.id,artifacts:s.artifacts}))}));}
export function reasoningInputDigest(task:AcademicTask):string{return sha256(JSON.stringify({inputs:task.inputFiles,questions:task.questions,formatting:task.formatting,observations:task.observations,requiresCitations:task.requiresCitations,requiresMeasurements:task.requiresMeasurements}));}
export async function fileReferences(ctx:AppContext,files:string[],call:CallContext,role?:string):Promise<FileReference[]>{
  const result:FileReference[]=[];for(const input of files){active(ctx,call);const f=await checkedFile(ctx,input,call.signal),identity=await getDocumentIdentity(ctx,f.path,f.sha256,call);result.push({path:f.path,sha256:f.sha256,canonicalSourceId:identity.sourceId,...(role?{role}:{})});}return result;
}
export async function freshness(ctx:AppContext,refs:FileReference[],call:CallContext):Promise<{fresh:boolean;issues:string[]}>{
  const issues:string[]=[],seen=new Set<string>();for(const ref of refs){const key=ref.path.toLowerCase()+'\0'+ref.sha256+'\0'+(ref.canonicalSourceId??'legacy');if(seen.has(key))continue;seen.add(key);active(ctx,call);try{const file=await checkedFile(ctx,ref.path,call.signal);if(file.sha256!==ref.sha256){issues.push(`Changed file: ${ref.path}`);continue;}if(ref.canonicalSourceId!==undefined||/\.pdf$/i.test(file.path)){const identity=await getDocumentIdentity(ctx,file.path,file.sha256,call);if(ref.canonicalSourceId!==undefined?identity.sourceId!==ref.canonicalSourceId:!!identity.extractionFingerprint)issues.push(`Changed canonical source/OCR provenance: ${ref.path}`);}}catch(e){active(ctx,call);issues.push(`Unavailable or no longer authorized: ${ref.path}`);}}return{fresh:issues.length===0,issues};
}

const controllers=new WeakMap<AppContext,Map<string,Set<AbortController>>>();
export function cancelTaskWork(ctx:AppContext,id:string):void{for(const c of controllers.get(ctx)?.get(id)??[])c.abort(new Error('Task cancelled.'));}
export async function withTaskWork<T>(ctx:AppContext,id:string,call:CallContext,fn:(work:CallContext)=>Promise<T>):Promise<T>{
  let tasks=controllers.get(ctx);if(!tasks){tasks=new Map();controllers.set(ctx,tasks);}let set=tasks.get(id);if(!set){set=new Set();tasks.set(id,set);}const c=new AbortController();set.add(c);
  try{return await fn({...call,signal:AbortSignal.any([call.signal,c.signal])});}finally{set.delete(c);if(!set.size)tasks.delete(id);}
}
export function isAcademicControlTool(name:string):boolean{return ['academic_task_cancel','academic_task_get','academic_task_list','academic_task_resume'].includes(name);}

export class TaskStore {
  readonly instanceId=randomUUID();private closed=false;
  constructor(readonly db:DatabaseSync){
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS academic_schema(version INTEGER NOT NULL); INSERT INTO academic_schema(version) SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM academic_schema); CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,status TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS task_events(id INTEGER PRIMARY KEY,task_id TEXT NOT NULL,event TEXT NOT NULL,revision INTEGER NOT NULL,at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS task_instances(id TEXT PRIMARY KEY,pid INTEGER NOT NULL,closed_at TEXT); CREATE TABLE IF NOT EXISTS reasoning_requests(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,status TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);');
    if((db.prepare('SELECT version FROM academic_schema').get() as any).version!==1)throw new Error('Unsupported academic task database schema.');
    db.prepare('INSERT INTO task_instances(id,pid) VALUES(?,?)').run(this.instanceId,process.pid);
    this.recover();
  }
  private ownerAlive(owner?:string,expires?:number):boolean{
    if(!owner||!expires||expires<Date.now())return false;const row=this.db.prepare('SELECT pid,closed_at FROM task_instances WHERE id=?').get(owner) as any;if(!row||row.closed_at)return false;
    try{process.kill(row.pid,0);return true;}catch(e:any){return e.code==='EPERM';}
  }
  private recover(){
    for(const row of this.db.prepare("SELECT body FROM tasks WHERE status NOT IN ('completed','cancelled')").all() as any[]){const task=JSON.parse(row.body) as AcademicTask;let changed=false;for(const s of task.steps)if(s.status==='running'&&!this.ownerAlive(s.owner,s.leaseExpires)){s.status=s.effect==='external'?'awaiting_host':'interrupted';s.warning=s.effect==='external'?'Previous external effects are unknown. Inspect them before any new action; no operation was replayed.':'Previous work was interrupted. Resume from the last verified checkpoint.';delete s.owner;delete s.leaseExpires;changed=true;}if(changed){task.status='interrupted';this.save(task,task.revision,'recovered_interrupted');}}
  }
  load(id:string):AcademicTask{if(this.closed)throw new Error('Academic task store is closed.');const row=this.db.prepare('SELECT body FROM tasks WHERE id=?').get(id) as any;if(!row)throw new Error('Unknown academic task.');return JSON.parse(row.body);}
  list(limit:number,offset:number,status?:TaskStatus):AcademicTask[]{const rows=status?this.db.prepare('SELECT body FROM tasks WHERE status=? ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(status,limit,offset):this.db.prepare('SELECT body FROM tasks ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit,offset);return(rows as any[]).map(r=>JSON.parse(r.body));}
  create(task:AcademicTask):void{noSecrets(task);if(JSON.stringify(task).length>1_000_000)throw new Error('Task metadata exceeds the 1 MB limit.');if((this.db.prepare('SELECT count(*) AS n FROM tasks').get() as any).n>=2000)throw new Error('Task-history limit reached (2000); export and remove old history locally before adding tasks.');this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run(task.id,task.revision,task.status,JSON.stringify(task),task.updatedAt);this.event(task.id,'created',task.revision);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
  save(task:AcademicTask,expected:number,event:string,additionalWrites?:()=>void):AcademicTask{
    if(this.closed)throw new Error('Academic task store is closed.');noSecrets(task);const body={...task,revision:expected+1,updatedAt:new Date().toISOString()};if(JSON.stringify(body).length>1_000_000)throw new Error('Task checkpoint exceeds the 1 MB limit.');
    this.db.exec('BEGIN IMMEDIATE');try{const result=this.db.prepare('UPDATE tasks SET revision=?,status=?,body=?,updated_at=? WHERE id=? AND revision=?').run(body.revision,body.status,JSON.stringify(body),body.updatedAt,body.id,expected);if(result.changes!==1)throw new Error('TASK_REVISION_CONFLICT: reread the task before updating it.');this.event(body.id,event,body.revision);additionalWrites?.();this.db.exec('COMMIT');Object.assign(task,body);return task;}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  event(id:string,event:string,revision:number){this.db.prepare('INSERT INTO task_events(task_id,event,revision,at) VALUES(?,?,?,?)').run(id,event.slice(0,80),revision,new Date().toISOString());}
  assertRevision(task:AcademicTask,revision:number){if(task.revision!==revision)throw new Error('TASK_REVISION_CONFLICT: reread the task before updating it.');}
  assertMutable(task:AcademicTask){if(task.status==='cancelled'||task.status==='completed')throw new Error(`Task is ${task.status}; resume it explicitly before changing work.`);}
  close(){
    if(this.closed)return;
    try{for(const row of this.db.prepare("SELECT body FROM tasks WHERE status NOT IN ('completed','cancelled')").all() as any[]){const task=JSON.parse(row.body) as AcademicTask;let changed=false;for(const s of task.steps)if(s.owner===this.instanceId&&s.status==='running'){s.status=s.effect==='external'?'awaiting_host':'interrupted';s.warning='Execution session closed; no effects will be replayed automatically.';delete s.owner;delete s.leaseExpires;changed=true;}if(changed){task.status='interrupted';this.save(task,task.revision,'session_closed');}}}
    finally{try{this.db.prepare('UPDATE task_instances SET closed_at=? WHERE id=?').run(new Date().toISOString(),this.instanceId);}finally{this.closed=true;this.db.close();}}
  }
}
const stores=new WeakMap<AppContext,Promise<TaskStore>>();
export function taskStore(ctx:AppContext):Promise<TaskStore>{let promise=stores.get(ctx);if(!promise){promise=(async()=>{const file=await academicDatabasePath(ctx,'tasks.sqlite');const store=new TaskStore(new DatabaseSync(file));ctx.emergency.onStop(async()=>{for(const id of controllers.get(ctx)?.keys()??[])cancelTaskWork(ctx,id);store.close();});return store;})();stores.set(ctx,promise);}return promise;}

/** Only actual execution/QA services call this helper; public host reports have a separate origin. */
export async function recordTaskEvidence(ctx:AppContext,taskId:string,evidence:{id:string;category:string;status:TaskEvidence['status'];details:string;inputHashes?:{path:string;sha256:string;canonicalSourceId?:string}[];artifactPaths?:string[]},call:CallContext):Promise<{taskId:string;revision:number;evidenceId:string}>{
  active(ctx,call);noSecrets(evidence);const store=await taskStore(ctx),task=store.load(taskId);store.assertMutable(task);
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(evidence.id)||!evidence.category||evidence.category.length>100||evidence.details.length>6000)throw new Error('Invalid task evidence metadata.');
  const supplied=evidence.inputHashes??[];if(supplied.length>1000)throw new Error('Too many evidence inputs.');const inputHashes:FileReference[]=[];for(const ref of supplied){const file=await checkedFile(ctx,ref.path,call.signal);if(file.sha256!==ref.sha256)throw new Error('Evidence refers to changed or unauthorized inputs.');const identity=await getDocumentIdentity(ctx,file.path,file.sha256,call);if(ref.canonicalSourceId!==undefined&&ref.canonicalSourceId!==identity.sourceId)throw new Error('Evidence refers to changed canonical source/OCR provenance.');inputHashes.push({...ref,path:file.path,canonicalSourceId:identity.sourceId});}
  if((evidence.artifactPaths?.length??0)>100)throw new Error('Too many evidence artifacts.');const artifacts=await fileReferences(ctx,evidence.artifactPaths??[],call,'verification');active(ctx,call);
  const entry:TaskEvidence={...evidence,origin:'computed',inputHashes,artifacts,createdAt:new Date().toISOString()};task.evidence=task.evidence.filter(e=>e.id!==entry.id);task.evidence.push(entry);delete task.verification;
  store.save(task,task.revision,'computed_evidence');return{taskId:task.id,revision:task.revision,evidenceId:entry.id};
}
