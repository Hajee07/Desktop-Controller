import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AuthorizedPaths, isWithin } from '../src/security/paths.js';
import { AuditLog } from '../src/audit/index.js';
import { EmergencyStop } from '../src/security/emergency.js';
import { defaultConfig, loadConfig } from '../src/config/index.js';
import { createContext } from '../src/server/context.js';
import { ProcessRunner } from '../src/utils/process.js';

let base:string;let root:string;let other:string;let policy:AuthorizedPaths;
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
before(async()=>{
  await fs.mkdir('test-results',{recursive:true});base=await fs.mkdtemp(path.resolve('test-results/security-'));
  root=path.join(base,'authorized');other=path.join(base,'other');await fs.mkdir(root);await fs.mkdir(other);
  policy=new AuthorizedPaths([root],[path.join(root,'protected')]);
  await fs.writeFile(path.join(root,'ordinary.txt'),'public fixture');await fs.writeFile(path.join(other,'outside.txt'),'outside fixture');
});
after(async()=>{if(base){const resolved=path.resolve(base);assert.ok(resolved.startsWith(path.resolve('test-results')+path.sep));await fs.rm(resolved,{recursive:true,force:true});}});

test('canonical path policy accepts only absolute local root descendants',async()=>{
  assert.equal(await policy.check(path.join(root,'ordinary.txt')),path.join(root,'ordinary.txt'));
  assert.ok(isWithin(root,path.join(root,'child')));assert.ok(!isWithin(root,root+'-prefix-confusion'));
  for(const denied of ['relative.txt',path.join(other,'outside.txt'),root+'-prefix-confusion\\file.txt',root+'\\..\\other\\outside.txt','\\\\server\\share\\file.txt','\\\\?\\C:\\file.txt'])await assert.rejects(()=>policy.check(denied),undefined,denied);
  await assert.rejects(()=>policy.check(path.join(root,'protected','new.txt'),'write'),/PATH_DENIED/);
  assert.equal(await policy.check(path.join(root,'new-folder','new.txt'),'write'),path.join(root,'new-folder','new.txt'));
  await assert.rejects(()=>policy.check(path.join(root,'missing.txt'),'read'));
});
test('ADS wildcard traversal trailing names and Windows device aliases are denied',async()=>{
  for(const denied of ['ordinary.txt:secret','x*','x?','x\u0000y','trailing.','trailing ','CON','NUL.txt','PRN.log','COM1.log','LPT9','COM¹.txt','LPT².txt','CONIN$','CONOUT$','SHORT~1.txt'])await assert.rejects(()=>policy.check(path.join(root,denied),'write'),/PATH_DENIED/,denied);
});
test('credential keys browser profiles and internal agent directories are denied',async()=>{
  for(const denied of ['.ssh/id_rsa','.aws/credentials','.azure/token','.gnupg/key','.codex/config.toml','.agents/skills','AppData/Local/Google/Chrome/User Data/Default/Cookies','.env','.env.production','passwords.txt','credential-store.json','secrets.yaml','auth.json','tokens.json','.npmrc','my-private.pem','private.key','vault/passwords.kdbx','Login Data','Local State','cookies','key4.db','logins.json'])await assert.rejects(()=>policy.check(path.join(root,denied),'write'),/PATH_DENIED/,denied);
});
test('junctions and hard links cannot escape roots, including nested destinations',async()=>{
  const junction=path.join(root,'junction');await fs.symlink(other,junction,'junction');
  await assert.rejects(()=>policy.check(path.join(junction,'outside.txt')),/PATH_DENIED/);
  await assert.rejects(()=>policy.check(path.join(junction,'new-folder','write.txt'),'write'),/PATH_DENIED/);
  const hard=path.join(root,'hard.txt');await fs.link(path.join(other,'outside.txt'),hard);await assert.rejects(()=>policy.check(hard),/PATH_DENIED/);
  const internal=path.join(root,'internal-junction');await fs.symlink(root,internal,'junction');await assert.rejects(()=>policy.check(path.join(internal,'ordinary.txt')),/PATH_DENIED/);
});
test('config loading validates roots and refuses state aliases before writes',async()=>{
  const project=path.join(base,'config-project');await fs.mkdir(project);await fs.mkdir(path.join(project,'workspace'));
  const config=defaultConfig(project);const filename=path.join(project,'config.json');await fs.writeFile(filename,JSON.stringify(config));
  assert.deepEqual((await loadConfig(project,filename)).authorizedRoots,config.authorizedRoots);
  const alias=path.join(project,'root-alias');await fs.symlink(other,alias,'junction');await fs.writeFile(filename,JSON.stringify({...config,authorizedRoots:[alias]}));await assert.rejects(()=>loadConfig(project,filename),/aliases/);
  const outsideState=path.join(base,'state-target');await fs.mkdir(outsideState);await fs.symlink(outsideState,config.stateDir,'junction');
  await assert.rejects(()=>createContext(config,project),/Unsafe|unsafe|alias|link/i);
  assert.deepEqual(await fs.readdir(outsideState),[],'No backups/audit files may be created through an untrusted .state junction.');
});
test('SQLite audit logs retain metadata while discarding secrets arguments errors paths and SQL',async()=>{
  const state=path.join(base,'audit');await fs.mkdir(state);const audit=new AuditLog(state);const secret='FIXTURE_SECRET_99138';
  try{audit.record('filesystem_read','ok',{durationMs:12.4,password:secret,sql:'SELECT '+secret,path:'C:\\'+secret,url:'https://example.test/?token='+secret,error:secret,output:secret});
    const rows=audit.list(10);assert.equal(rows.length,1);const serialized=JSON.stringify(rows);assert.ok(!serialized.includes(secret));assert.match(serialized,/filesystem_read/);assert.match(serialized,/12/);
    audit.record('tool','unknown-status',{token:secret});assert.equal((audit.list(1)[0] as any).status,'error');
  }finally{audit.close();}
  const contents=await fs.readFile(path.join(state,'audit.sqlite'));assert.ok(!contents.includes(Buffer.from(secret)));
});
test('emergency stop aborts active work, persists, and fires hooks exactly once',async()=>{
  const state=path.join(base,'emergency');await fs.mkdir(state);const emergency=new EmergencyStop(state);let called=0;const controller=new AbortController();
  emergency.onStop(async()=>{called++;});emergency.track(controller);
  try{await Promise.all([emergency.stop(),emergency.stop()]);await pause(100);assert.equal(controller.signal.aborted,true);assert.throws(()=>emergency.assertRunning(),/EMERGENCY_STOP/);assert.equal(called,1,'Repeated stop and file watcher events must be idempotent.');}
  finally{emergency.close();}
  const restarted=new EmergencyStop(state);try{assert.throws(()=>restarted.assertRunning(),/EMERGENCY_STOP/);}finally{restarted.close();}
});
test('local STOP sentinel aborts tracked work without an MCP round trip',async()=>{
  const state=path.join(base,'sentinel');await fs.mkdir(state);const emergency=new EmergencyStop(state);const controller=new AbortController();emergency.track(controller);
  try{await fs.writeFile(path.join(state,'STOP'),'local emergency fixture');for(let i=0;i<20&&!controller.signal.aborted;i++)await pause(20);assert.equal(controller.signal.aborted,true);assert.throws(()=>emergency.assertRunning(),/EMERGENCY_STOP/);}
  finally{emergency.close();}
});
test('process timeout kills the owned process before delayed changes occur',async()=>{
  const runner=new ProcessRunner();const marker=path.join(base,'timeout-marker.txt');
  const script=`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'should not run'),1500);setInterval(()=>{},1000)`;
  try{await assert.rejects(()=>runner.run(process.execPath,['-e',script],{timeoutMs:150}),/timeout/i);await pause(1800);await assert.rejects(()=>fs.stat(marker));}
  finally{await runner.stop();}
});
test('project child processes receive a sanitized environment',async()=>{
  const runner=new ProcessRunner();const name='WINDOWS_MCP_FIXTURE_SECRET';process.env[name]='super-secret-fixture';
  try{const result=await runner.run(process.execPath,['-e',`process.stdout.write(String(process.env.${name}))`],{timeoutMs:5000});assert.equal(result.exitCode,0);assert.equal(result.stdout,'undefined');}
  finally{delete process.env[name];await runner.stop();}
});
