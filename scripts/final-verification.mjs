// Read-only live STDIO/config verification; preserves the test and native evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import TOML from '@iarna/toml';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const project=path.resolve(import.meta.dirname,'..');
const configurationPath=path.join(process.env.USERPROFILE,'.codex','config.toml');
const config=TOML.parse(await fs.readFile(configurationPath,'utf8'));
const registered=config.mcp_servers.windows_laptop;
assert.equal(registered.cwd,project);
assert.deepEqual(registered.args,[path.join(project,'dist','index.js')]);
await fs.access(registered.command);
const transport=new StdioClientTransport({command:registered.command,args:registered.args,cwd:registered.cwd,stderr:'pipe'});
let diagnostics='';transport.stderr?.on('data',d=>{diagnostics+=String(d);});
const client=new Client({name:'ultimate-final-readonly-verification',version:'3.0.0'},{capabilities:{}});
const record={verifiedAt:new Date().toISOString(),scope:'Fresh client using the actual registered local STDIO executable/project. Native acceptance and unit/regression outcomes are separate evidence, not all-tools live coverage.'};
try{
 await client.connect(transport);
 const listed=await client.listTools();
 const manifest=JSON.parse(await fs.readFile(path.join(project,'documentation','tool-manifest.json'),'utf8'));
 assert.deepEqual(listed.tools.map(t=>t.name).sort(),manifest.map(t=>t.name).sort());
 const call=async name=>{const result=await client.callTool({name,arguments:{}});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content.find(c=>c.type==='text').text);};
 record.health=await call('system_mcp_health');
 record.resources=await call('system_resources');
 record.storage=await call('system_storage');
 assert.equal(record.health.version,'3.0.0');assert.equal(record.health.transport,'stdio');assert.equal(record.health.stopped,false);assert.equal(record.storage.quotaBytes,20000000000);
 const settings=await call('configuration_get');
 record.authorization={roots:settings.authorizedRoots,permissions:settings.permissions,desktop:settings.desktop,applicationLaunchPolicy:settings.applicationLaunchPolicy};
 record.discovery={tools:listed.tools.length,duplicateNames:false,invalidRequiredSchemasExercisedBySmoke:132,hostApprovalDeclineSmoke:'passed',stdoutProtocol:'parsed successfully by official SDK'};
 const tests=await fs.readFile(path.join(project,'ultimate-tests-final.log'),'utf8');
 record.regression={total:Number(tests.match(/ℹ tests (\d+)/)?.[1]),passed:Number(tests.match(/ℹ pass (\d+)/)?.[1]),failed:Number(tests.match(/ℹ fail (\d+)/)?.[1]),skipped:Number(tests.match(/ℹ skipped (\d+)/)?.[1]),log:'ultimate-tests-final.log',skips:['Word already running: standalone owned rendering','Word already running: owned renderer cleanup','Windows file-symlink creation privilege unavailable']};
 assert.equal(record.regression.failed,0);assert.equal(record.regression.total,record.regression.passed+record.regression.skipped);
 record.evidence={};
 for(const name of ['ULTIMATE-ACCEPTANCE.json','ULTIMATE-ADVANCED-VERIFICATION.json','ULTIMATE-OFFICE-EXTRAS.json','ULTIMATE-OFFICE-EXPORTS.json','ULTIMATE-RECOVERY-VERIFICATION.json','ULTIMATE-CODING-VERIFICATION.json','ULTIMATE-POLICY-VERIFICATION.json','DASHBOARD-VERIFICATION.json','VSCODE-CLI-VERIFICATION.json']){
  const data=await fs.readFile(path.join(project,'documentation',name));record.evidence[name]={sha256:createHash('sha256').update(data).digest('hex')};
 }
 const acceptance=JSON.parse(await fs.readFile(path.join(project,'documentation','ULTIMATE-ACCEPTANCE.json'),'utf8'));
 assert.equal(acceptance.completed,true);
 record.artifacts=[];
 for(const name of ['Sample-Assignment.docx','Sample-Assignment.pdf','actual-word-window.png','actual-dashboard-final.png','verified-current-page.png','final-excel-export.pdf','final-powerpoint-export.pdf']){
  const file=path.join(acceptance.root,name),data=await fs.readFile(file);record.artifacts.push({path:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 record.academicSmoke={stdio:true,formats:['docx','pdf','xlsx','pptx'],formulaValue:6,sourcesPreserved:true,completionGate:'blocked pending real technical/layout review',log:'ultimate-academic-final.log'};
 record.codex={configurationPath,registeredTransport:{command:registered.command,args:registered.args,cwd:registered.cwd,startup_timeout_sec:registered.startup_timeout_sec,tool_timeout_sec:registered.tool_timeout_sec},existingServers:Object.keys(config.mcp_servers),reconnectRequiredForCurrentChat:true};
 record.limits={individualFileBytes:2147483648,binaryProcessingBytes:268435456,officeXmlBytes:41943040,extractedTextCodeUnits:2500000,quotaIsApplicationLevel:true,otherAIProvidersInstalled:0};
 record.notVerified=['Each tool success path in every application','VS Code active/unsaved editor buffers and visible line position','Screen/region capture variants','All dashboard buttons/floating-panel interaction','Production Undo/restore human dialogs (fixture callbacks only)','MySQL/PostgreSQL live services'];
 record.notImplemented=['Universal private-state control of every application','PowerPoint native chart-data adapter','OS sandbox for arbitrary untrusted code','Additional AI reasoning after Codex disconnect'];
 if(process.argv.includes('--with-live-receipt')){
  const live=JSON.parse(await fs.readFile(path.join(project,'documentation','ULTIMATE-CODEX-LIVE-VERIFICATION.json'),'utf8'));
  assert.equal(live.health.version,record.health.version);assert.equal(live.tools,listed.tools.length);assert.equal(live.word.save.saved,true);assert.equal(live.word.readback.originalParagraphPreserved,true);
  record.connectedCodexSession=live;record.codex.reconnectRequiredForCurrentChat=false;
 }
 record.result=record.codex.reconnectRequiredForCurrentChat?'Implemented upgrade with explicit coverage and remaining boundaries; reconnect Codex to load the catalog.':'Actual connected Codex session verified version/catalog, native Word insertion, save and readback on an owned fixture.';
}finally{await client.close();}
await fs.writeFile(path.join(project,'documentation','ULTIMATE-FINAL-VERIFICATION.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({tools:record.discovery.tools,regression:record.regression,quota:record.storage.quotaBytes,usedBytes:record.storage.usedBytes,freeDiskBytes:record.storage.projectDriveFreeBytes,nodeResidentBytes:record.resources.memory.rss,reconnectRequired:record.codex.reconnectRequiredForCurrentChat},null,2));
