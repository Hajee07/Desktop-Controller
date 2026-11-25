// Explicit local acceptance on a newly created owned fixture, never personal documents.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../dist/config/index.js';
import {createContext} from '../dist/server/context.js';
import {allTools} from '../dist/server/index.js';

const project=path.resolve(import.meta.dirname,'..');
let ctx=await createContext(await loadConfig(project),project),tools=allTools(ctx),confirmations=0;
const root=path.join(project,'workspace','recovery-acceptance-'+Date.now());
await fs.mkdir(root);
const document=path.join(root,'Owned-Recovery-Fixture.docx');
const record={root,scope:'Actual native Word on a newly generated owned fixture. Protected Undo/restore use a test confirmation callback; this does not verify production dialog approval.',checks:{}};
const call={signal:AbortSignal.timeout(110000),confirm:async()=>{confirmations++;}};
async function run(name,args={}){const tool=tools.find(t=>t.name===name);assert.ok(tool,name);return tool.execute(tool.schema.parse(args),call);}
try{
 await run('academic_document_compose',{path:document,title:'Owned recovery fixture',sections:[{heading:'Question 1',paragraphs:[{text:'Original supplied content must survive recovery.'}]}],dryRun:false});
 const opened=await run('word_open',{path:document,dryRun:false}),target={documentId:opened.documentId,path:document};
 let state,checkpoint;
 // A just-opened document can still normalize its layout. Only this non-mutating
 // checkpoint inspection is retried; uncertain edits below are never replayed.
 for(let attempt=0;attempt<3;attempt++){
  state=await run('word_get_document_properties',target);
  try{checkpoint=await run('word_create_checkpoint',{...target,expectedRevision:state.revision});record.readOnlyCheckpointRetries=attempt;break;}
  catch(error){if(!/STALE_REVISION/.test(error.message)||attempt===2)throw error;}
 }
 record.checks.checkpoint=Boolean(checkpoint.sha256);
 let paragraphs=await run('word_get_paragraphs',target);
 const operation={kind:'insert',start:paragraphs.paragraphs[0].end,end:paragraphs.paragraphs[0].end,text:'Temporary native edit for Undo verification.\n'};
 const edit=await run('word_edit_batch',{...target,expectedRevision:paragraphs.revision,requestKey:randomUUID(),operations:[operation],dryRun:false});
 const undone=await run('word_undo_transaction',{...target,expectedRevision:edit.revision,transactionId:edit.transactionId});
 assert.equal(undone.undone,true);
 paragraphs=await run('word_get_paragraphs',target);
 assert.ok(!JSON.stringify(paragraphs.paragraphs).includes('Temporary native edit'));
 record.checks.nativeUndo=true;
 const edit2=await run('word_edit_batch',{...target,expectedRevision:paragraphs.revision,requestKey:randomUUID(),operations:[{...operation,text:'Temporary content for checkpoint restore.\n'}],dryRun:false});
 await run('word_restore_checkpoint',{...target,expectedRevision:edit2.revision,checkpointPath:checkpoint.checkpointPath,checkpointSha256:checkpoint.sha256});
 paragraphs=await run('word_get_paragraphs',target);
 const actual=JSON.stringify(paragraphs.paragraphs);
 assert.ok(actual.includes('Original supplied content must survive recovery.'));
 assert.ok(!actual.includes('Temporary content for checkpoint restore.'));
 await run('word_save_document',{...target,expectedRevision:paragraphs.revision});
 record.checks.checkpointRestoreVerified=true;
 await ctx.shutdown();
 ctx=await createContext(await loadConfig(project),project);tools=allTools(ctx);
 const discovered=await run('word_list_open_documents');
 assert.equal(discovered.documents.filter(d=>d.path.toLowerCase()===document.toLowerCase()).length,1);
 assert.ok(discovered.documents.some(d=>d.documentId===target.documentId));
 const reused=await run('word_open',{path:document,dryRun:false});
 assert.equal(reused.documentId,target.documentId);
 record.checks.workerReconnectRetainsOpenWord=true;
 record.checks.samePathOpenReusesDocument=true;
 record.protectedTestConfirmations=confirmations;
 record.completed=true;
 console.log(JSON.stringify(record,null,2));
}catch(error){record.error=error.message;console.error(error);process.exitCode=1;}
finally{await fs.writeFile(path.join(project,'documentation','ULTIMATE-RECOVERY-VERIFICATION.json'),JSON.stringify(record,null,2)+'\n');await ctx.shutdown();}
