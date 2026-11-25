import { spawn } from 'node:child_process';
import { lstat, open, realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AppContext, CallContext } from '../server/types.js';

function parse(args:string[],values:Set<string>,flags:Set<string>){
  const options=new Map<string,string>(),positionals:string[]=[];
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(!arg.startsWith('-')){positionals.push(arg);continue;}
    const equal=arg.indexOf('='),key=equal<0?arg:arg.slice(0,equal);
    if(options.has(key))throw new Error('Duplicate dump options are prohibited.');
    if(values.has(key)){const value=equal<0?args[++i]:arg.slice(equal+1);if(value===undefined||value.startsWith('--')||/[\x00-\x1f]/.test(value))throw new Error('Invalid dump option value.');options.set(key,value);}
    else if(flags.has(key)&&equal<0)options.set(key,'true');
    else throw new Error('Unsupported dump option. Password arguments, credential files, short flags, arbitrary connection strings, and shell wrappers are prohibited.');
  }
  return{options,positionals};
}
export async function nativeDumpPlan(ctx:AppContext,database:string,output:string,commandId:string){
  const c=Object.hasOwn(ctx.config.databases,database)?ctx.config.databases[database]:undefined;
  const command=Object.hasOwn(ctx.config.commands,commandId)?ctx.config.commands[commandId]:undefined;
  if(!c||!['mysql','postgres'].includes(c.driver))throw new Error('Native dumps require a configured MySQL/PostgreSQL connection.');
  if(!command)throw new Error('Configure a fixed pg_dump.exe or mysqldump.exe command and provide its commandId.');
  if(!c.host||!c.database||!c.user||/^[-]|[:=\x00-\x1f]/.test(c.database))throw new Error('Native dumps require explicit host, database, and user; database names cannot be options or connection strings.');
  const expected=c.driver==='postgres'?'pg_dump.exe':'mysqldump.exe';
  if(!path.isAbsolute(command.executable)||path.basename(command.executable).toLowerCase()!==expected)throw new Error(`Native backup command must directly use absolute ${expected}.`);
  const pg=c.driver==='postgres';
  const parsed=parse(command.args,new Set(pg?['--host','--port','--username','--dbname','--file','--format','--encoding','--lock-wait-timeout']:['--host','--port','--user','--result-file','--default-character-set','--set-gtid-purged','--column-statistics']),new Set(pg?['--no-password','--no-owner','--no-privileges','--verbose','--blobs','--large-objects']:['--no-defaults','--no-login-paths','--single-transaction','--routines','--events','--triggers','--hex-blob','--no-tablespaces','--databases']));
  const opts=parsed.options;
  if(opts.get('--host')!==c.host||opts.get('--port')!==String(c.port??(pg?5432:3306))||opts.get(pg?'--username':'--user')!==c.user)throw new Error('Dump command host, port, and user must exactly match the named database configuration.');
  if(pg){if(opts.get('--dbname')!==c.database||parsed.positionals.length||!opts.has('--no-password'))throw new Error('pg_dump requires matching --dbname and --no-password; positional database arguments are prohibited.');if(opts.has('--format')&&!['plain','custom','tar','p','c','t'].includes(opts.get('--format')!))throw new Error('Only single-file pg_dump formats are supported.');}
  else{if(command.args[0]!=='--no-defaults'||!['--no-login-paths','--single-transaction','--routines','--events','--triggers'].every(key=>opts.has(key))||parsed.positionals.length!==1||parsed.positionals[0]!==c.database)throw new Error('mysqldump requires --no-defaults first, --no-login-paths, --single-transaction, --routines, --events, --triggers, and exactly the configured database name.');}
  const destination=await ctx.paths.check(output,'write'),fixedOutput=opts.get(pg?'--file':'--result-file');
  if(!fixedOutput||!path.isAbsolute(fixedOutput)||path.resolve(fixedOutput).toLowerCase()!==destination.toLowerCase())throw new Error('The fixed dump --file/--result-file must exactly match the requested authorized backup path.');
  try{await stat(destination);throw new Error('Backup destination already exists. Choose a new path and configure that exact fixed output command.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  return{database,driver:c.driver,commandId,executable:command.executable,args:command.args,path:destination,host:c.host,port:c.port??(pg?5432:3306),user:c.user,format:pg?(opts.get('--format')??'plain'):'sql',passwordEnv:c.passwordEnv};
}

export async function executeNativeDump(ctx:AppContext,plan:Awaited<ReturnType<typeof nativeDumpPlan>>,call:CallContext):Promise<unknown>{
  const check=()=>{call.signal.throwIfAborted();ctx.emergency.assertRunning();};
  check();
  const absolute=path.resolve(plan.executable);if(/[:\x00-\x1f]/.test(absolute.slice(path.parse(absolute).root.length)))throw new Error('Executable alternate streams are prohibited.');
  let cursor=path.parse(absolute).root;for(const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if((await lstat(cursor)).isSymbolicLink()||(await realpath(cursor)).toLowerCase()!==cursor.toLowerCase())throw new Error('Dump executable links and aliases are prohibited.');}
  if(!(await stat(absolute)).isFile())throw new Error('Dump executable must be a regular file.');
  const password=plan.passwordEnv?process.env[plan.passwordEnv]:undefined;if(plan.passwordEnv&&!password)throw new Error('Configured database password environment variable is unavailable.');
  const env:NodeJS.ProcessEnv={};for(const key of ['SystemRoot','WINDIR','SystemDrive','COMSPEC','TEMP','TMP','PATH','PATHEXT'])if(process.env[key])env[key]=process.env[key];
  const emptyCredentialPath=path.join(ctx.config.stateDir,'disabled-credential-files-do-not-create');
  try{await lstat(emptyCredentialPath);throw new Error('Disabled credential-file sentinel path must not exist.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  env.PGPASSFILE=emptyCredentialPath;env.PGSERVICEFILE=emptyCredentialPath;env.PGSYSCONFDIR=emptyCredentialPath;env.PGSSLCERT=emptyCredentialPath;env.PGSSLKEY=emptyCredentialPath;env.PGSSLROOTCERT=emptyCredentialPath;env.MYSQL_TEST_LOGIN_FILE=emptyCredentialPath;
  if(password)env[plan.driver==='postgres'?'PGPASSWORD':'MYSQL_PWD']=password;
  const target=await ctx.paths.check(plan.path,'write');check();
  const reserved=await open(target,'wx');await reserved.close();
  let success=false;
  try{
    await ctx.paths.check(target,'write');check();
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(absolute,plan.args,{cwd:ctx.projectDir,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let stopped:string|undefined;let bytes=0;
      const abort=()=>{stopped='cancelled';child.kill();};call.signal.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>{stopped='timed out';child.kill();},ctx.config.toolTimeoutMs);
      const consume=(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024*1024){stopped='exceeded the diagnostic output limit';child.kill();}};
      // Native diagnostics are deliberately discarded: they may contain SQL/data/credential details.
      child.stdout.on('data',consume);child.stderr.on('data',consume);
      const cleanup=()=>{clearTimeout(timer);call.signal.removeEventListener('abort',abort);};
      child.once('error',()=>{cleanup();reject(new Error('Native backup utility could not start.'));});
      child.once('close',code=>{cleanup();if(stopped)reject(new Error(`Native backup ${stopped}.`));else if(code!==0)reject(new Error(`Native backup utility exited (${code}); diagnostics omitted to protect database information.`));else resolve();});
    });
    check();const output=await ctx.paths.check(target,'read'),info=await stat(output);if(!info.isFile()||info.size===0)throw new Error('Native backup did not produce a nonempty regular file.');success=true;
    return{database:plan.database,path:output,format:plan.format,bytes:info.size,nativeUtility:path.basename(absolute)};
  }finally{delete env.PGPASSWORD;delete env.MYSQL_PWD;if(!success)await unlink(target).catch(()=>{});}
}
