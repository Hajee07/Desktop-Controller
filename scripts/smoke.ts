import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { defaultConfig } from '../src/config/index.js';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const testBase=path.join(project,'test-results');await fs.mkdir(testBase,{recursive:true});
const folder=await fs.mkdtemp(path.join(testBase,'stdio-'));const fixture=path.join(folder,'files');await fs.mkdir(fixture);
const cfg=defaultConfig(project);cfg.authorizedRoots=[fixture];cfg.browser.headless=true;
const configFile=path.join(folder,'server-config.json');await fs.writeFile(configFile,JSON.stringify(cfg));
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(project,'dist','index.js')],cwd:project,env:{...Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>typeof e[1]==='string')),WINDOWS_MCP_CONFIG:configFile},stderr:'pipe'});
let stderr='';transport.stderr?.on('data',d=>stderr+=String(d));
const client=new Client({name:'windows-laptop-mcp-smoke',version:'1.0.0'},{capabilities:{elicitation:{form:{}}}});
let approvalRequests=0;client.setRequestHandler('elicitation/create',async()=>{approvalRequests++;return{action:'decline'};});
try{
  await client.connect(transport);
  const listed=await client.listTools();assert.ok(listed.tools.length>=50);assert.equal(new Set(listed.tools.map(t=>t.name)).size,listed.tools.length);
  const call=async(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args});
  const ok=async(name:string,args:Record<string,unknown>={})=>{const r=await call(name,args);assert.ok(!('isError'in r)||!r.isError,`${name}: ${JSON.stringify(r)}`);return r;};
  await ok('configuration_get');await ok('audit_get_logs');await ok('filesystem_roots');
  const filename=path.join(fixture,'hello.txt');
  await ok('filesystem_create',{path:filename,content:'hello fixture',dryRun:false});
  const read=await ok('filesystem_read',{path:filename});assert.match(JSON.stringify(read),/hello fixture/);
  await ok('filesystem_list',{path:fixture});await ok('filesystem_search',{path:fixture,name:'hello'});
  await ok('powershell_preview',{commandId:'node-version',cwd:fixture});await ok('powershell_execute_approved',{commandId:'node-version',cwd:fixture,dryRun:false});
  const denied=await call('powershell_execute_approved',{commandId:'arbitrary',cwd:fixture,dryRun:false});assert.equal((denied as any).isError,true);
  const outside=await call('filesystem_read',{path:path.join(project,'package.json')});assert.equal((outside as any).isError,true);
  const deletion=await call('filesystem_delete',{path:filename,dryRun:false});assert.equal((deletion as any).isError,true);assert.equal(approvalRequests,1);assert.equal(await fs.readFile(filename,'utf8'),'hello fixture');
  // Every advertised tool is also exercised through SDK validation with an invalid schema value.
  // Read-only no-argument tools can accept {} and are covered separately by module integration tests.
  let validated=0;
  for(const tool of listed.tools){
    if(tool.inputSchema.required?.length){try{const result=await call(tool.name,{[tool.inputSchema.required[0]]:{invalid:true}});assert.equal((result as any).isError,true,tool.name);}catch(error:any){assert.match(error.message,/invalid|validation|parameter|required|expected/i);}validated++;}
  }
  await fs.writeFile(path.join(project,'documentation','tool-manifest.json'),JSON.stringify(listed.tools,null,2)+'\n');
  console.log(JSON.stringify({stdio:'passed',toolsDiscovered:listed.tools.length,invalidSchemasExercised:validated,hostApprovalDecline:'passed',localDialog:'not opened',stderrProtocolNoise:!/\bhello fixture\b/.test(stderr)},null,2));
}finally{
  await client.close();
  const real=await fs.realpath(folder);if(path.dirname(real).toLowerCase()!==testBase.toLowerCase())throw new Error('Unsafe fixture cleanup target');await fs.rm(real,{recursive:true,force:true});
}
