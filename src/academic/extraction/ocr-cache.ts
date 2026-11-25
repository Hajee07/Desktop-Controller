import {TEXT_EXTRACTION_REVISION} from '../../utils/text-limits.js';
import fs from'node:fs/promises';
import path from'node:path';
import{DatabaseSync}from'node:sqlite';
import{z}from'zod';
import type{AppContext,CallContext}from'../../server/types.js';
import{academicDatabasePath,active,sha256}from'../common.js';

const recordSchema=z.object({version:z.literal(1),path:z.string(),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),page:z.number().int().positive(),language:z.string().min(2).max(50),text:z.string().max(100000),imageSha256:z.string().regex(/^[a-f0-9]{64}$/),textSha256:z.string().regex(/^[a-f0-9]{64}$/),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),engine:z.literal('windows_ocr'),warnings:z.array(z.string().max(2000)).max(30)}).strict();
export type OcrRecord=z.infer<typeof recordSchema>;
const key=(filename:string)=>path.resolve(filename).toLowerCase();
const payloadFingerprint=(record:Pick<OcrRecord,'sourceSha256'|'page'|'language'|'text'|'imageSha256'>)=>sha256(JSON.stringify({sourceSha256:record.sourceSha256,page:record.page,language:record.language,text:record.text,imageSha256:record.imageSha256,engine:'windows_ocr'}));
async function openCache(ctx:AppContext){const file=await academicDatabasePath(ctx,'ocr.sqlite');const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=2000;CREATE TABLE IF NOT EXISTS ocr_pages(source_key TEXT NOT NULL,source_sha256 TEXT NOT NULL,page INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(source_key,source_sha256,page));');return db;}
async function hasCache(ctx:AppContext){const file=await academicDatabasePath(ctx,'ocr.sqlite');try{await fs.lstat(file);return true;}catch(e:any){if(e.code==='ENOENT')return false;throw e;}}
/** OCR is only reusable for currently authorized, byte-identical source PDFs. */
export async function readOcrPages(ctx:AppContext,filename:string,binaryHash:string,call:CallContext):Promise<OcrRecord[]>{
 active(ctx,call);await ctx.paths.check(filename);if(path.extname(filename).toLowerCase()!=='.pdf'||!await hasCache(ctx))return[];
 const db=await openCache(ctx);try{
  const rows=db.prepare('SELECT body FROM ocr_pages WHERE source_key=? AND source_sha256=? ORDER BY page LIMIT 100').all(key(filename),binaryHash)as{body:string}[];
  return rows.map(row=>{const record=recordSchema.parse(JSON.parse(row.body));if(key(record.path)!==key(filename)||record.sourceSha256!==binaryHash||record.textSha256!==sha256(record.text)||record.fingerprint!==payloadFingerprint(record))throw new Error('OCR cache integrity/provenance mismatch; run OCR again');return record;});
 }finally{db.close();}
}
export function ocrIdentity(filename:string,binaryHash:string,records:OcrRecord[]){
 const extractionFingerprint=records.length?sha256(records.map(r=>r.page+':'+r.fingerprint).join('\n')):'';
 return{sourceId:'src_'+sha256(key(filename)+'\0'+binaryHash+'\0'+TEXT_EXTRACTION_REVISION+(extractionFingerprint?'\0ocr:'+extractionFingerprint:'')).slice(0,24),extractionFingerprint};
}
/** Drop only derived index state; source files and prior OCR records are never edited. */
async function invalidateIndex(ctx:AppContext,filename:string):Promise<boolean>{
 const file=await academicDatabasePath(ctx,'index.sqlite');try{await fs.lstat(file);}catch(e:any){if(e.code==='ENOENT')return false;throw e;}
 const db=new DatabaseSync(file);try{
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sources'").get())return false;
  const rows=(db.prepare('SELECT id,path FROM sources WHERE active=1').all()as{id:string;path:string}[]).filter(row=>key(row.path)===key(filename));if(!rows.length)return false;
  db.exec('BEGIN IMMEDIATE');try{for(const row of rows){db.prepare('UPDATE sources SET active=0 WHERE id=?').run(row.id);db.prepare('DELETE FROM chunks_fts WHERE source_id=?').run(row.id);db.prepare('DELETE FROM chunks WHERE source_id=?').run(row.id);}db.prepare("DELETE FROM models WHERE name='lsa'").run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return true;
 }finally{db.close();}
}
export async function saveOcrPage(ctx:AppContext,record:Omit<OcrRecord,'version'|'textSha256'|'fingerprint'|'engine'|'createdAt'>,call:CallContext){
 active(ctx,call);await ctx.paths.check(record.path);if(!record.text.trim())throw new Error('OCR recognized no text; the prior cache was not replaced. Inspect the actual page image.');const full=recordSchema.parse({...record,version:1,textSha256:sha256(record.text),fingerprint:payloadFingerprint(record),createdAt:new Date().toISOString(),engine:'windows_ocr'});
 const db=await openCache(ctx);let changed=false;try{const old=db.prepare('SELECT body FROM ocr_pages WHERE source_key=? AND source_sha256=? AND page=?').get(key(record.path),record.sourceSha256,record.page)as{body:string}|undefined;try{changed=!old||recordSchema.parse(JSON.parse(old.body)).fingerprint!==full.fingerprint;}catch{changed=true;}
  active(ctx,call);db.exec('BEGIN IMMEDIATE');try{const count=db.prepare('SELECT COUNT(*) AS n FROM ocr_pages WHERE source_key=? AND source_sha256=? AND page<>?').get(key(record.path),record.sourceSha256,record.page)as{n:number};if(count.n>=100)throw new Error('OCR cache is bounded to 100 pages per source; split oversized source work explicitly.');db.prepare('DELETE FROM ocr_pages WHERE source_key=? AND source_sha256<>?').run(key(record.path),record.sourceSha256);db.prepare('INSERT OR REPLACE INTO ocr_pages VALUES(?,?,?,?)').run(key(record.path),record.sourceSha256,record.page,JSON.stringify(full));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }finally{db.close();}
 const indexInvalidated=changed?await invalidateIndex(ctx,record.path):false;return{record:full,changed,indexInvalidated};
}
/** A denied source must not continue contributing cached OCR or cached index evidence. */
export async function revokeOcrSource(ctx:AppContext,filename:string){if(!path.isAbsolute(filename))return;const normalized=key(filename);if(await hasCache(ctx)){const db=await openCache(ctx);try{db.prepare('DELETE FROM ocr_pages WHERE source_key=?').run(normalized);}finally{db.close();}}await invalidateIndex(ctx,filename);}
