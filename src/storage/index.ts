import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AppContext,ToolDefinition} from '../server/types.js';
import {AuthorizedPaths,isWithin} from '../security/paths.js';
import {hashFile} from '../utils/files.js';

export const GiB=1024**3;
export const GB=1000**3;
export const storageSchema=z.object({quotaBytes:z.number().int().min(1024).max(20*GB).default(20*GB),minFreeBytes:z.number().int().min(0).default(5*GB),categoryBytes:z.object({documents:z.number().int().positive().default(5*GB),images:z.number().int().positive().default(5*GB),research:z.number().int().positive().default(3*GB),temporary:z.number().int().positive().default(3*GB),history:z.number().int().positive().default(GB),reserved:z.number().int().positive().default(3*GB)}).strict().default({documents:5*GB,images:5*GB,research:3*GB,temporary:3*GB,history:GB,reserved:3*GB})}).strict();
type Category='documents'|'images'|'research'|'temporary'|'history'|'reserved';
export class ManagedStorage {
  readonly config;private db:DatabaseSync;
  constructor(private ctx:AppContext){this.config=storageSchema.parse(ctx.config.storage??{});this.db=new DatabaseSync(path.join(ctx.config.stateDir,'storage.sqlite'));this.db.exec('PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,category TEXT,bytes INTEGER,expires INTEGER);');}
  category(file:string):Category{const relative=path.relative(this.ctx.config.stateDir,file);if(['temp','browser-profile'].some(n=>relative===n||relative.startsWith(n+path.sep)))return'temporary';if(['backups','browsers','database-backups'].some(n=>relative===n||relative.startsWith(n+path.sep)))return'reserved';if(isWithin(this.ctx.config.stateDir,file))return'history';if(/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(file))return'images';if(/(^|[\\/])research([\\/]|$)/i.test(file))return'research';if(/\.(docx|pptx|xlsx|pdf|txt|md|csv)$/i.test(file))return'documents';return'reserved';}
  async inventory(signal?:AbortSignal){
    const isDriveRoot = (r: string) => path.parse(r).root.toLowerCase() === path.resolve(r).toLowerCase();
    const candidateRoots = [
      this.ctx.config.stateDir,
      path.join(this.ctx.projectDir, 'workspace'),
      ...this.ctx.config.authorizedRoots.filter(r => !isDriveRoot(r))
    ];
    const roots = candidateRoots.map(r => path.resolve(r)).filter((r, i, a) => !a.some((other, j) => j !== i && isWithin(other, r) && (other.length < r.length || j < i)));
    const totals:Record<Category,number>={documents:0,images:0,research:0,temporary:0,history:0,reserved:0};const files:{path:string;bytes:number;mtimeMs:number}[]=[];let inspected=0;
    const policy=this.ctx.paths;
    for(const root of roots){const pending=[root];while(pending.length){
      signal?.throwIfAborted();
      const dir=pending.pop()!, internal=isWithin(this.ctx.config.stateDir,dir);
      if(!internal&&policy instanceof AuthorizedPaths){try{await policy.check(dir);}catch{continue;}}
      let entries;
      try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e:any){if(e.code==='ENOENT'||e.code==='EPERM'||e.code==='EACCES')continue;throw new Error('Storage scan cannot verify directory: '+dir);}
      inspected+=entries.length;
      if(inspected>200000)throw new Error('Storage scan limit reached; narrow authorized roots before writing');
      for(let offset=0;offset<entries.length;offset+=32){
        signal?.throwIfAborted();
        await Promise.all(entries.slice(offset,offset+32).map(async entry=>{
          const file=path.join(dir,entry.name);
          if(!internal){try{if(policy instanceof AuthorizedPaths)policy.checkName(file);else await policy.check(file);}catch{return;}}
          try{
            const s=await fs.lstat(file);
            if(s.isSymbolicLink()||(!internal&&s.isFile()&&s.nlink>1))return;
            if((await fs.realpath(file)).toLowerCase()!==file.toLowerCase())return;
            if(s.isDirectory())pending.push(file);
            else if(s.isFile()){totals[this.category(file)]+=s.size;files.push({path:file,bytes:s.size,mtimeMs:s.mtimeMs});}
          }catch(error:any){if(error.code!=='ENOENT'&&error.code!=='EPERM'&&error.code!=='EACCES'&&error.code!=='EBUSY')throw error;}
        }));
      }
    }}return{totals,totalBytes:Object.values(totals).reduce((a,b)=>a+b,0),files};
  }
  async report(signal?:AbortSignal){const data=await this.inventory(signal);const v=await fs.statfs(this.ctx.projectDir);return{quotaBytes:this.config.quotaBytes,usedBytes:data.totalBytes,availableQuotaBytes:Math.max(0,this.config.quotaBytes-data.totalBytes),categories:data.totals,categoryLimits:this.config.categoryBytes,projectDriveFreeBytes:v.bavail*v.bsize,minFreeBytes:this.config.minFreeBytes,fileCount:data.files.length,scope:'Authorized roots plus protected server state; originals count but are never automatically removed'};}
  async cleanupCache(signal?:AbortSignal){const dir=path.join(this.ctx.config.stateDir,'temp');let stat;try{stat=await fs.lstat(dir);}catch(e:any){if(e.code==='ENOENT')return;throw e;}if(!stat.isDirectory()||stat.isSymbolicLink()||(await fs.realpath(dir)).toLowerCase()!==dir.toLowerCase())throw new Error('Unsafe cache directory');for(const entry of await fs.readdir(dir,{withFileTypes:true})){signal?.throwIfAborted();if(!entry.isFile()||entry.isSymbolicLink())continue;const file=path.join(dir,entry.name),s=await fs.lstat(file);if(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&Date.now()-s.mtimeMs>24*3600000)await fs.unlink(file);}}
  async reserve(destination:string,bytes:number,signal?:AbortSignal):Promise<()=>void>{
    if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Invalid storage reservation');signal?.throwIfAborted();await this.cleanupCache(signal);const inv=await this.inventory(signal),category=this.category(destination);let dir=path.dirname(destination);while(!await fs.stat(dir).then(s=>s.isDirectory(),()=>false))dir=path.dirname(dir);const v=await fs.statfs(dir);
    this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM reservations WHERE expires<?').run(Date.now());const rows=this.db.prepare('SELECT category,SUM(bytes) bytes FROM reservations GROUP BY category').all()as any[];const pending=rows.reduce((n,r)=>n+Number(r.bytes),0),pendingCategory=Number(rows.find(r=>r.category===category)?.bytes??0);
      if(inv.totalBytes+pending+bytes>this.config.quotaBytes)throw new Error('WORKSPACE_QUOTA_EXCEEDED');if(inv.totals[category]+pendingCategory+bytes>this.config.categoryBytes[category])throw new Error('STORAGE_CATEGORY_QUOTA_EXCEEDED: '+category);if(v.bavail*v.bsize-pending-bytes<this.config.minFreeBytes)throw new Error('DISK_FREE_SPACE_RESERVE');
      const id=randomUUID();this.db.prepare('INSERT INTO reservations VALUES(?,?,?,?)').run(id,category,bytes,Date.now()+15*60*1000);this.db.exec('COMMIT');let released=false;return()=>{if(!released){released=true;this.db.prepare('DELETE FROM reservations WHERE id=?').run(id);}};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  close(){this.db.close();}
}
export async function reserveOutput(ctx:AppContext,destination:string,bytes:number,signal?:AbortSignal){return ctx.storage?ctx.storage.reserve(destination,bytes,signal):()=>{};}
export function storageTools(ctx:AppContext):ToolDefinition[]{return[
  {name:'system_storage',description:'Inspect managed 20 GB quota, category usage and disk free-space reserve. No cleanup of originals.',schema:z.object({}).strict(),readOnly:true,execute:async(_,c)=>ctx.storage!.report(c.signal)},
  {name:'storage_find_duplicates',description:'Stream hashes of same-size authorized files to report duplicates. Never deletes originals.',schema:z.object({limit:z.number().int().min(1).max(100).default(20)}).strict(),readOnly:true,execute:async(i,c)=>{const inv=await ctx.storage!.inventory(c.signal);const groups=new Map<number,typeof inv.files>();for(const f of inv.files){if(isWithin(ctx.config.stateDir,f.path))continue;const g=groups.get(f.bytes)??[];g.push(f);groups.set(f.bytes,g);}const results=[];for(const group of groups.values()){if(group.length<2)continue;const hashes=new Map<string,string[]>();for(const f of group){await ctx.paths.check(f.path);const hash=await hashFile(f.path,ctx.config.maxReadBytes,c.signal),a=hashes.get(hash)??[];a.push(f.path);hashes.set(hash,a);}for(const [sha256,files]of hashes)if(files.length>1)results.push({sha256,files});if(results.length>=i.limit)break;}return{duplicates:results.slice(0,i.limit)};}},
  {name:'storage_cleanup_temporary',description:'Preview/remove only ordinary direct files in server-owned .state/temp older than the selected age. Never touches original documents.',schema:z.object({olderThanHours:z.number().min(1).max(8760).default(24),dryRun:z.boolean().default(true)}).strict(),readOnly:false,execute:async(i,c)=>{const dir=path.join(ctx.config.stateDir,'temp');await fs.mkdir(dir,{recursive:true});if((await fs.lstat(dir)).isSymbolicLink())throw new Error('Temporary directory alias denied');const files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){c.signal.throwIfAborted();if(!e.isFile()||e.isSymbolicLink())continue;const f=path.join(dir,e.name),s=await fs.lstat(f);if(s.nlink!==1||Date.now()-s.mtimeMs<i.olderThanHours*3600000)continue;files.push({path:f,bytes:s.size});}if(!i.dryRun)for(const f of files){c.signal.throwIfAborted();const s=await fs.lstat(f.path);if(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1)await fs.unlink(f.path);}return{dryRun:i.dryRun,files};}}
];}
