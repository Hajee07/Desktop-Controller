// Real STDIO policy checks on owned fixtures; host denial never opens a local dialog.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {defaultConfig} from '../dist/config/index.js';
const project=path.resolve(import.meta.dirname,'..'),base=path.join(project,'test-results');await fs.mkdir(base,{recursive:true});
const fixture=await fs.mkdtemp(path.join(base,'policy-')),workspace=await fs.mkdtemp(path.join(project,'workspace','policy-'));
const cfg=defaultConfig(project);cfg.authorizedRoots=[workspace,fixture];cfg.permissions={automaticWorkspaceEdits:true,automaticCapture:false};
const configFile=path.join(fixture,'server-config.json');await fs.writeFile(configFile,JSON.stringify(cfg));
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(project,'dist/index.js')],cwd:project,env:{...process.env,WINDOWS_MCP_CONFIG:configFile},stderr:'pipe'});
transport.stderr?.on('data',()=>{});
const client=new Client({name:'trusted-workspace-policy-acceptance',version:'3.0.0'},{capabilities:{elicitation:{form:{}}}});
let approvals=0;client.setRequestHandler('elicitation/create',async()=>{approvals++;return{action:'decline'};});
const record={scope:'Actual SDK STDIO calls on newly owned workspace/non-workspace fixture files only.',checks:{}};
const raw=(name,args)=>client.callTool({name,arguments:args});
const call=async(name,args)=>{const result=await raw(name,args);assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content.find(c=>c.type==='text').text);};
try{
 await client.connect(transport);
 const file=path.join(workspace,'original.txt'),moved=path.join(workspace,'moved.txt'),renamed=path.join(workspace,'renamed.txt');
 await call('filesystem_create',{path:file,content:'owned fixture original',dryRun:false});
 const source=await call('filesystem_read',{path:file});
 const edit=await call('filesystem_edit',{path:file,content:'verified trusted workspace edit',expectedSha256:source.sha256,dryRun:false});
 assert.equal(await fs.readFile(edit.backup,'utf8'),'owned fixture original');
 await call('filesystem_move',{source:file,destination:moved,dryRun:false});
 await call('filesystem_rename',{source:moved,destination:renamed,dryRun:false});
 assert.equal(await fs.readFile(renamed,'utf8'),'verified trusted workspace edit');
 assert.equal(approvals,0);record.checks.workspaceEditMoveRenameWithoutRepeatedElicitation=true;record.checks.backupOriginalVerified=true;
 const original=path.join(fixture,'protected-original.txt');await call('filesystem_create',{path:original,content:'must remain unchanged',dryRun:false});
 const before=await call('filesystem_read',{path:original});
 const denied=await raw('filesystem_edit',{path:original,content:'must not apply',expectedSha256:before.sha256,dryRun:false});
 assert.equal(denied.isError,true);assert.equal(approvals,1);assert.equal(await fs.readFile(original,'utf8'),'must remain unchanged');
 record.checks.nonWorkspaceOriginalStillRequiresApproval=true;record.checks.hostDenialPreservesOriginal=true;
 record.hostDeclines=approvals;record.localDialog='Not opened: host declined the protected operation';record.completed=true;console.log(JSON.stringify(record,null,2));
}catch(error){record.error=error.message;console.error(error);process.exitCode=1;}
finally{await client.close();await fs.writeFile(path.join(project,'documentation','ULTIMATE-POLICY-VERIFICATION.json'),JSON.stringify(record,null,2)+'\n');for(const [folder,parent]of[[workspace,path.join(project,'workspace')],[fixture,base]]){assert.equal(path.dirname(await fs.realpath(folder)),parent);await fs.rm(folder,{recursive:true,force:true});}}
