import {reserveOutput}from'../storage/index.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { mkdir, open, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import mysql from 'mysql2/promise';
import type { AppContext, CallContext, ToolDefinition } from '../server/types.js';
import { nativeDumpPlan,executeNativeDump } from './dump.js';

type Params = (string | number | boolean | null)[];
const input = z.object({ database: z.string().min(1).max(100) });
const queryInput = input.extend({ sql: z.string().min(1).max(20000), params: z.array(z.union([z.string().max(100000), z.number().finite(), z.boolean(), z.null()])).max(100).default([]), limit: z.number().int().min(1).max(1000).default(100) });
const safeFunctions = new Set('select count sum avg min max coalesce nullif lower upper length char_length round abs substr substring trim ltrim rtrim replace date datetime strftime cast typeof ifnull concat in exists values as over filter'.split(' '));

/** Deliberately small single-statement SQL subset; native read-only transactions remain authoritative. */
export function validateSql(sql: string, write = false): void {
  if (/;|--|\/\*|\*\/|\x00|\$\$/.test(sql)) throw new Error('SQL comments, multiple statements, and dollar quoting are not allowed.');
  const code = sql.replace(/'(?:''|[^'])*'/g, "''");
  if (/\b(attach|detach|pragma|vacuum|copy|call|execute|exec|load_extension|outfile|dumpfile|sleep|benchmark|pg_sleep|dblink|lo_import|lo_export|set_config|nextval|setval|for\s+update|for\s+share)\b/i.test(code) || (!write && /\binto\b/i.test(code))) throw new Error('SQL contains a disallowed operation.');
  if (write) {
    if (!/^\s*(insert\s+into|update\s|delete\s+from)/i.test(code)) throw new Error('Only parameterized INSERT, UPDATE, or DELETE are supported for writes.');
    // INSERT INTO is the only allowed INTO occurrence.
    if (/\b(select|with|returning|create|alter|drop|truncate|grant|revoke|begin|commit)\b/i.test(code)) throw new Error('Unsupported write SQL.');
    if (/^\s*(update|delete)\b/i.test(code) && !/\bwhere\b/i.test(code)) throw new Error('UPDATE and DELETE require an explicit WHERE clause.');
  } else if (!/^\s*select\b/i.test(code) || /\b(insert|update|delete|with|create|alter|drop|truncate|grant|revoke|lock|set|reset)\b/i.test(code)) throw new Error('Read-only queries must be a single SELECT.');
  for (const match of code.matchAll(/([\w.]+|"[^"]+"|`[^`]+`|\[[^\]]+\])\s*\(/g)) {
    if (!safeFunctions.has(match[1].toLowerCase()) && !(write && /^\s*insert\s+into\s*$/i.test(code.slice(0, match.index)))) throw new Error('Only the documented pure SQL function allowlist is supported.');
  }
}

const sqliteWorker = String.raw`
const { DatabaseSync, backup } = require('node:sqlite');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',async()=>{
try{
 const d=JSON.parse(input);
 const db = new DatabaseSync(d.path, { readOnly: d.mode !== 'write', allowExtension: false, timeout: 3000 });
 let result;
 try {
  db.exec('PRAGMA trusted_schema=OFF');
  if (d.mode === 'inspect') {
   const tables=db.prepare("SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 500").all();
   result={tables};
  } else if (d.mode === 'backup') {
   await backup(db,d.output); result={path:d.output,format:'sqlite'};
  } else if (d.mode === 'write') {
   db.exec('BEGIN IMMEDIATE');
   try {
    const r=db.prepare(d.sql).run(...d.params.map(v=>typeof v==='boolean'?Number(v):v));
    if (Number(r.changes)>100) throw Error('Write affects more than the 100-row safety limit.');
    db.exec('COMMIT'); result={changes:Number(r.changes),lastInsertRowid:String(r.lastInsertRowid)};
   } catch(e) { db.exec('ROLLBACK'); throw e; }
  } else {
   db.exec('PRAGMA query_only=ON');
   const s=db.prepare(d.sql); s.setReadBigInts(true);
   const rows=[]; let truncated=false;
   for(const row of s.iterate(...d.params.map(v=>typeof v==='boolean'?Number(v):v))) {
    if(rows.length>=d.limit) {truncated=true;break;}
    rows.push(row);
   }
   result={rows,truncated};
  }
 } finally { db.close(); }
 process.stdout.write(JSON.stringify({ok:true,result},(_k,v)=>typeof v==='bigint'?String(v):v));
}catch(e){process.stdout.write(JSON.stringify({ok:false,error:e.message}));}
});
`;

async function sqlite(data: Record<string, unknown>, signal: AbortSignal, timeoutMs: number): Promise<any> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]!]]));
    const worker = spawn(process.execPath, ['--max-old-space-size=128','--input-type=commonjs','-e',sqliteWorker], {windowsHide:true,stdio:['pipe','pipe','pipe'],env});
    let output='';
    let settled = false;
    const finish = (error?: Error, result?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(result); };
    let cancelled:Error|undefined;
    const abort = () => {cancelled=new Error('Database operation cancelled.');worker.kill();};
    const timer = setTimeout(() => {cancelled=new Error('Database operation timed out.');worker.kill();}, timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    worker.stdout.setEncoding('utf8');worker.stdout.on('data',chunk=>{output+=chunk;if(output.length>8*1024*1024){cancelled=new Error('Database result exceeds the 8 MiB output limit.');worker.kill();}});
    worker.stderr.resume();worker.stdin.on('error',()=>{});worker.stdin.end(JSON.stringify(data));
    worker.once('error', e => finish(e));
    worker.once('close', code => {if(cancelled)return finish(cancelled);try{const m=JSON.parse(output);m.ok?finish(undefined,m.result):finish(new Error(m.error));}catch{finish(new Error(`Database subprocess exited (${code}) without a valid result.`));}});
  });
}

function json(value: unknown): string { return JSON.stringify(value, (_k,v) => typeof v === 'bigint' ? String(v) : Buffer.isBuffer(v) ? {base64:v.toString('base64')} : v, 2); }
export function databaseTools(ctx: AppContext): ToolDefinition[] {
  function active(call:CallContext){call.signal.throwIfAborted();ctx.emergency.assertRunning();}
  function config(name: string) {
    const c = Object.hasOwn(ctx.config.databases,name)?ctx.config.databases[name]:undefined; if (!c) throw new Error('Database is not configured. Add a named connection using the local configuration process.');
    return c;
  }
  async function run(name: string, sql: string, params: Params, limit: number, call: CallContext, mode: 'read'|'write'|'inspect' = 'read'): Promise<any> {
    ctx.emergency.assertRunning(); call.signal.throwIfAborted();
    const c = config(name);
    if (mode !== 'inspect') validateSql(sql, mode === 'write');
    if (c.driver === 'sqlite') {
      if (!c.path) throw new Error('SQLite connection requires path.');
      const path = await ctx.paths.check(c.path, mode === 'write' ? 'write' : 'read');
      return sqlite({path, mode, sql, params, limit}, call.signal, ctx.config.toolTimeoutMs);
    }
    const password = c.passwordEnv ? process.env[c.passwordEnv] : undefined;
    if (c.passwordEnv && !password) throw new Error('Configured database password environment variable is unavailable.');
    const query = mode === 'inspect' ? (c.driver === 'postgres' ? "SELECT table_schema,table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position LIMIT 1000" : 'SELECT table_schema,table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position LIMIT 1000') : sql;
    if (c.driver === 'postgres') {
      const client = new Client({ host:c.host,port:c.port,database:c.database,user:c.user,password, connectionTimeoutMillis:5000, statement_timeout:ctx.config.toolTimeoutMs, query_timeout:ctx.config.toolTimeoutMs, application_name:'windows-laptop-control-mcp' });
      const abort=()=>{ void client.end(); }; call.signal.addEventListener('abort',abort,{once:true});
      try {
        await client.connect(); await client.query(mode === 'write' ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout = '3s'");
        const text=mode === 'read' ? `SELECT * FROM (${query}) AS mcp_result LIMIT ${limit+1}` : query;
        const result=await client.query({text,values:params});
        if(mode==='write' && (result.rowCount??0)>100) throw new Error('Write exceeds the 100-row safety limit.');
        await client.query('COMMIT'); return mode==='write'?{changes:result.rowCount}:{rows:result.rows.slice(0,limit),truncated:result.rows.length>limit};
      } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw new Error(`PostgreSQL operation failed (${(e as {code?:string}).code ?? 'connection/query error'}). SQL and credentials were omitted.`); }
      finally {call.signal.removeEventListener('abort',abort);await client.end().catch(()=>{});}
    }
    const connection=await mysql.createConnection({host:c.host,port:c.port,database:c.database,user:c.user,password,connectTimeout:5000,multipleStatements:false,enableKeepAlive:false});
    const abort=()=>connection.destroy();call.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,ctx.config.toolTimeoutMs);
    try {
      await connection.query(mode==='write'?'START TRANSACTION':'START TRANSACTION READ ONLY');
      const text=mode==='read'?`SELECT * FROM (${query}) AS mcp_result LIMIT ${limit+1}`:query;
      const [result]:any=await connection.execute(text,params);
      if(mode==='write' && result.affectedRows>100) throw new Error('Write exceeds the 100-row safety limit.');
      await connection.commit();return mode==='write'?{changes:result.affectedRows}:{rows:result.slice(0,limit),truncated:result.length>limit};
    } catch(e) { await connection.rollback().catch(()=>{});throw new Error(`MySQL operation failed (${(e as {code?:string}).code ?? 'connection/query error'}). SQL and credentials were omitted.`); }
    finally {clearTimeout(timer);call.signal.removeEventListener('abort',abort);await connection.end().catch(()=>{});}
  }
  return [
    { name:'database_inspect',description:'List configured database names, or inspect the tables, columns, and schema of a named SQLite/MySQL/PostgreSQL database. Credentials are never returned.',schema:z.object({database:z.string().max(100).optional()}),readOnly:true,execute:async(a,call)=>a.database?run(a.database,'',[],1000,call,'inspect'):{databases:Object.entries(ctx.config.databases).map(([name,c])=>({name,driver:c.driver,allowWrite:c.allowWrite}))} },
    { name:'database_query_readonly',description:'Run one bounded SELECT with positional parameters. Native read-only connection/transaction, pure function allowlist, no comments, PRAGMA, CTE, or multiple statements.',schema:queryInput,readOnly:true,execute:(a,call)=>run(a.database,a.sql,a.params,a.limit,call) },
    { name:'database_modify',description:'Preview or apply one parameterized INSERT/UPDATE/DELETE on an explicitly write-enabled connection. Requires host approval and separate local confirmation; UPDATE/DELETE require WHERE; at most 100 changed rows.',schema:queryInput.omit({limit:true}).extend({dryRun:z.boolean().default(true)}),readOnly:false,destructive:true,execute:async(a,call)=>{
      const c=config(a.database);if(!c.allowWrite)throw new Error('Database writes are disabled for this connection.');validateSql(a.sql,true);
      if(!a.params.length)throw new Error('Database writes require bound parameters.');
      if(a.dryRun)return {dryRun:true,database:a.database,sql:a.sql,parameterCount:a.params.length,maxChangedRows:100};
      await call.confirm('Modify database',`Database: ${a.database}\nSQL: ${a.sql}\nBound parameters: ${json(a.params)}\nEffect: commit up to 100 affected rows. Database triggers may have additional effects.`);
      active(call);let backupPath:string|null=null;if(c.driver==='sqlite'&&c.path){
        const source=await ctx.paths.check(c.path,'write'),folder=path.join(ctx.config.stateDir,'database-backups');active(call);await mkdir(folder,{recursive:true});
        const state=await realpath(ctx.config.stateDir),target=await realpath(folder);if(!target.startsWith(state+path.sep))throw new Error('Database backups must stay inside server state.');
        backupPath=path.join(target,`${Date.now()}-${randomUUID()}.sqlite`);
        active(call);const release=await reserveOutput(ctx,backupPath,(await stat(source)).size*2+1048576,call.signal);try{const file=await open(backupPath,'wx');await file.close();await sqlite({path:source,mode:'backup',output:backupPath},call.signal,ctx.config.toolTimeoutMs);}finally{release();}
      }
      return {...await run(a.database,a.sql,a.params,100,call,'write'),backup:backupPath};
    } },
    { name:'database_export',description:'Preview or export a bounded read-only query to a new JSON or CSV file in an authorized directory. CSV formula-like strings are escaped.',schema:queryInput.extend({path:z.string().min(1),format:z.enum(['json','csv']).default('json'),dryRun:z.boolean().default(true)}),readOnly:false,execute:async(a,call)=>{
      validateSql(a.sql);const path=await ctx.paths.check(a.path,'write');
      if(a.dryRun)return {dryRun:true,path,format:a.format,maxRows:a.limit};
      const result=await run(a.database,a.sql,a.params,a.limit,call);active(call);
      let text=json(result);if(a.format==='csv') { const keys=[...new Set<string>(result.rows.flatMap((r:any)=>Object.keys(r)))];const cell=(v:unknown)=>{let s=v==null?'':typeof v==='object'?json(v):String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};text=[keys.map(cell).join(','),...result.rows.map((r:any)=>keys.map(k=>cell(r[k])).join(','))].join('\r\n'); }
      const target=await ctx.paths.check(path,'write');active(call);const release=await reserveOutput(ctx,target,Buffer.byteLength(text)+65536,call.signal);try{await writeFile(target,text,{encoding:'utf8',flag:'wx'});}finally{release();}return {path,rows:result.rows.length,truncated:result.truncated};
    } },
    { name:'database_backup',description:'Create a consistent SQLite online backup, or a full MySQL/PostgreSQL dump using an explicitly configured fixed native dump commandId. New authorized output only; native dumps confirm exact command, reject password argv/credential files, and use only configured temporary password environment.',schema:input.extend({path:z.string().min(1),commandId:z.string().min(1).max(64).optional(),dryRun:z.boolean().default(true)}),readOnly:false,destructive:true,openWorld:true,execute:async(a,call)=>{
      const c=config(a.database);if(c.driver!=='sqlite'){
        if(!a.commandId)throw new Error('MySQL/PostgreSQL full backups require an explicitly configured native dump commandId.');
        const plan=await nativeDumpPlan(ctx,a.database,a.path,a.commandId);
        if(a.dryRun)return{dryRun:true,...plan};
        await call.confirm('Create native database backup',JSON.stringify(plan,null,2)+'\nRead this configured database and write its complete dump to the new output file. Credentials are supplied only to the temporary child environment; utility diagnostics are discarded. MySQL nontransactional tables may require database-specific backup planning.');
        active(call);return executeNativeDump(ctx,plan,call);
      }
      const source=await ctx.paths.check(c.path!,'read'),output=await ctx.paths.check(a.path,'write');if(source.toLowerCase()===output.toLowerCase())throw new Error('Backup destination must differ from source.');
      try {await stat(output);throw new Error('Backup destination already exists.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(a.dryRun)return {dryRun:true,source,path:output,format:'sqlite'};
      // Reserve destination exclusively. SQLite's backup API writes only this newly-created file.
      const target=await ctx.paths.check(output,'write');active(call);const release=await reserveOutput(ctx,target,(await stat(source)).size*2+1048576,call.signal);try{const file=await open(target,'wx');await file.close();try{return await sqlite({path:source,mode:'backup',output},call.signal,ctx.config.toolTimeoutMs);}catch(e){await unlink(output).catch(()=>{});throw e;}}finally{release();}
    } }
  ];
}
