import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, validateSql } from '../src/database/index.js';
import { nativeDumpPlan } from '../src/database/dump.js';
import type { AppConfig, AppContext, CallContext } from '../src/server/types.js';

test('database SQL subset rejects write, file, extension, multiple-statement and function escapes',()=>{
  for(const sql of ['DELETE FROM t','SELECT 1; SELECT 2','WITH x AS (DELETE FROM t) SELECT 1','PRAGMA table_list','SELECT load_extension(?)','SELECT pg_sleep(2)','SELECT evil_function(1)','SELECT 1 INTO OUTFILE ?','SELECT * FROM t FOR UPDATE','SELECT \'x\' -- comment'])assert.throws(()=>validateSql(sql));
  for(const sql of ['SELECT id,name FROM items WHERE id=?','SELECT count(*) FROM items','SELECT (1+2) AS value','SELECT lower(name) FROM items'])assert.doesNotThrow(()=>validateSql(sql));
  assert.throws(()=>validateSql('UPDATE items SET name=?',true));
  assert.throws(()=>validateSql('DELETE FROM items',true));
  assert.throws(()=>validateSql('INSERT INTO items(name) VALUES(evil(?))',true));
  assert.doesNotThrow(()=>validateSql('INSERT INTO items(name) VALUES(?)',true));
});

test('SQLite tools execute real isolated queries, confirmed writes, online backups, bounded export, rollback, and cancellation',async()=>{
  const base=path.resolve('test-results');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'database-'));const dbPath=path.join(dir,'fixture.sqlite'),stateDir=path.join(dir,'state');await mkdir(stateDir);
  const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE items(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO items(name) VALUES (\'first\'),(\'second\');');db.close();
  let confirmations=0;const call:CallContext={signal:new AbortController().signal,confirm:async()=>{confirmations++;}};
  const config={databases:{fixture:{driver:'sqlite',path:dbPath,allowWrite:true},readonly:{driver:'sqlite',path:dbPath,allowWrite:false}},stateDir,toolTimeoutMs:5000} as unknown as AppConfig;
  const ctx={config,projectDir:dir,paths:{check:async(p:string)=>{const resolved=path.resolve(p);if(!resolved.startsWith(dir+path.sep))throw new Error('Outside authorized root.');return resolved;},isRoot:()=>false},backup:async()=>null,emergency:{assertRunning(){},onStop(){},async stop(){}},audit:{record(){},list(){return[];}}} as unknown as AppContext;
  const tools=databaseTools(ctx);const run=async(name:string,args:Record<string,unknown>,c=call)=>{const t=tools.find(t=>t.name===name)!;return t.execute(t.schema.parse(args),c) as Promise<any>;};
  try{
    assert.equal((await run('database_inspect',{})).databases.length,2);
    assert.equal((await run('database_inspect',{database:'fixture'})).tables[0].name,'items');
    const rows=await run('database_query_readonly',{database:'fixture',sql:'SELECT * FROM items ORDER BY id',limit:1});assert.equal(rows.rows.length,1);assert.equal(rows.truncated,true);
    const preview=await run('database_modify',{database:'fixture',sql:'UPDATE items SET name=? WHERE id=?',params:['changed',1]});assert.equal(preview.dryRun,true);assert.equal(confirmations,0);
    const write=await run('database_modify',{database:'fixture',sql:'UPDATE items SET name=? WHERE id=?',params:['changed',1],dryRun:false});assert.equal(write.changes,1);assert.equal(confirmations,1);assert.ok((await stat(write.backup)).size>0);
    const prior=new DatabaseSync(write.backup,{readOnly:true});assert.equal(prior.prepare('SELECT name FROM items WHERE id=1').get()?.name,'first');prior.close();
    await assert.rejects(run('database_modify',{database:'readonly',sql:'DELETE FROM items WHERE id=?',params:[1],dryRun:false}),/disabled/);
    const deny:CallContext={signal:call.signal,confirm:async()=>{throw new Error('User declined.');}};
    await assert.rejects(run('database_modify',{database:'fixture',sql:'DELETE FROM items WHERE id=?',params:[1],dryRun:false},deny),/declined/);
    assert.equal((await run('database_query_readonly',{database:'fixture',sql:'SELECT name FROM items WHERE id=?',params:[1]})).rows[0].name,'changed');
    const backup=path.join(dir,'online.sqlite');assert.equal((await run('database_backup',{database:'fixture',path:backup})).dryRun,true);
    await run('database_backup',{database:'fixture',path:backup,dryRun:false});const copy=new DatabaseSync(backup,{readOnly:true});assert.equal(copy.prepare('SELECT count(*) AS n FROM items').get()?.n,2);copy.close();
    await assert.rejects(run('database_backup',{database:'fixture',path:backup,dryRun:false}),/exists/);
    const output=path.join(dir,'result.csv');await run('database_export',{database:'fixture',sql:'SELECT * FROM items',path:output,format:'csv',dryRun:false});assert.match(await readFile(output,'utf8'),/changed/);
    await assert.rejects(run('database_export',{database:'fixture',sql:'SELECT * FROM items',path:output,dryRun:false}),/EEXIST/);
    await assert.rejects(run('database_query_readonly',{database:'unknown',sql:'SELECT 1'}),/not configured/);
    await assert.rejects(run('database_query_readonly',{database:'__proto__',sql:'SELECT 1'}),/not configured/);
    await assert.rejects(run('database_backup',{database:'fixture',path:path.resolve(dir,'..','escape.sqlite'),dryRun:false}),/Outside/);
    const controller=new AbortController();controller.abort();await assert.rejects(run('database_query_readonly',{database:'fixture',sql:'SELECT 1'},{...call,signal:controller.signal}));
    const lots=new DatabaseSync(dbPath);for(let i=0;i<110;i++)lots.prepare('INSERT INTO items(name) VALUES (?)').run('item');lots.close();
    await assert.rejects(run('database_modify',{database:'fixture',sql:'UPDATE items SET name=? WHERE id>?',params:['too-many',0],dryRun:false}),/100-row/);
    assert.equal((await run('database_query_readonly',{database:'fixture',sql:'SELECT name FROM items WHERE id=?',params:[1]})).rows[0].name,'changed');
    config.toolTimeoutMs=100;await assert.rejects(run('database_query_readonly',{database:'fixture',sql:'SELECT count(*) AS n FROM items a CROSS JOIN items b CROSS JOIN items c CROSS JOIN items d CROSS JOIN items e'}),/timed out/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('MySQL/PostgreSQL credentials are environment-only and missing variables fail closed',async()=>{
  const config={databases:{pg:{driver:'postgres',passwordEnv:'WINDOWS_MCP_TEST_ABSENT_SECRET',allowWrite:false},mysql:{driver:'mysql',passwordEnv:'WINDOWS_MCP_TEST_ABSENT_SECRET',allowWrite:false}},toolTimeoutMs:1000} as unknown as AppConfig;
  const ctx={config,emergency:{assertRunning(){}}} as unknown as AppContext;const tool=databaseTools(ctx).find(t=>t.name==='database_query_readonly')!;
  for(const database of ['pg','mysql'])await assert.rejects(tool.execute(tool.schema.parse({database,sql:'SELECT 1'}),{signal:new AbortController().signal,confirm:async()=>{}}),/environment variable/);
});

test('native dump previews validate fixed utilities, matching connection/output, credential-file exclusions, and no overwrite',async()=>{
  const base=path.resolve('test-results');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'dump-'));const output=path.join(dir,'backup.dump');
  const pgArgs=['--no-password','--host=127.0.0.1','--port=5432','--username=fixture','--dbname=fixture','--format=custom',`--file=${output}`];
  const mysqlArgs=['--no-defaults','--no-login-paths','--host=127.0.0.1','--port=3306','--user=fixture','--single-transaction','--routines','--events','--triggers',`--result-file=${output}`,'fixture'];
  const cfg={databases:{pg:{driver:'postgres',host:'127.0.0.1',database:'fixture',user:'fixture',passwordEnv:'ABSENT_NATIVE_DUMP_PASSWORD',allowWrite:false},mysql:{driver:'mysql',host:'127.0.0.1',database:'fixture',user:'fixture',allowWrite:false}},commands:{pg:{executable:path.join(dir,'pg_dump.exe'),args:pgArgs,description:'Fixture dump',requiresConfirmation:true,allowNetwork:true},mysql:{executable:path.join(dir,'mysqldump.exe'),args:mysqlArgs,description:'Fixture dump',requiresConfirmation:true,allowNetwork:true}},stateDir:dir} as unknown as AppConfig;
  const ctx={config:cfg,paths:{check:async(p:string)=>{const absolute=path.resolve(p);if(!absolute.startsWith(dir+path.sep))throw new Error('Outside root');return absolute;}},emergency:{assertRunning(){}}} as unknown as AppContext;
  try{
    assert.equal((await nativeDumpPlan(ctx,'pg',output,'pg')).format,'custom');assert.equal((await nativeDumpPlan(ctx,'mysql',output,'mysql')).format,'sql');
    const backup=databaseTools(ctx).find(t=>t.name==='database_backup')!;const call:CallContext={signal:new AbortController().signal,confirm:async()=>{}};
    assert.equal((await backup.execute(backup.schema.parse({database:'pg',path:output,commandId:'pg'}),call) as any).dryRun,true);
    await assert.rejects(backup.execute(backup.schema.parse({database:'pg',path:output,commandId:'pg',dryRun:false}),call),/ENOENT/);
    await assert.rejects(nativeDumpPlan(ctx,'pg',path.join(dir,'other.dump'),'pg'),/exactly match/);
    cfg.commands.pg.args=[...pgArgs,'--password=BAD'];await assert.rejects(nativeDumpPlan(ctx,'pg',output,'pg'),/Unsupported/);cfg.commands.pg.args=pgArgs;
    cfg.commands.pg.args=pgArgs.map(x=>x==='--dbname=fixture'?'--dbname=other':x);await assert.rejects(nativeDumpPlan(ctx,'pg',output,'pg'),/matching --dbname/);cfg.commands.pg.args=pgArgs;
    cfg.commands.pg.executable=process.execPath;await assert.rejects(nativeDumpPlan(ctx,'pg',output,'pg'),/pg_dump/);cfg.commands.pg.executable=path.join(dir,'pg_dump.exe');
    cfg.commands.mysql.args=mysqlArgs.filter(x=>x!=='--no-login-paths');await assert.rejects(nativeDumpPlan(ctx,'mysql',output,'mysql'),/no-login-paths/);cfg.commands.mysql.args=mysqlArgs;
    const {writeFile}=await import('node:fs/promises');await writeFile(output,'existing');await assert.rejects(nativeDumpPlan(ctx,'pg',output,'pg'),/exists/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
