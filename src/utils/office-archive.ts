import JSZip from 'jszip';
import {XMLValidator} from 'fast-xml-parser';
import {MAX_FILE_BYTES} from './files.js';

export const DEFAULT_OFFICE_XML_BYTES=40*1024*1024;
export interface OfficeArchiveLimits {maxOfficeArchiveBytes?:number;maxOfficeXmlBytes?:number}

// JSZip exposes internalStream at runtime; its bundled typings omit this API.
function boundedPart(entry:JSZip.JSZipObject,maxBytes:number,signal?:AbortSignal):Promise<Buffer>{
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const stream=(entry as any).internalStream('nodebuffer');const chunks:Buffer[]=[];let bytes=0,finished=false;
    const finish=(error?:Error)=>{if(finished)return;finished=true;stream.pause();signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(Buffer.concat(chunks,bytes));};
    const abort=()=>finish(new Error('Office extraction cancelled'));
    stream.on('data',(chunk:Buffer)=>{if(finished)return;bytes+=chunk.length;if(bytes>maxBytes){finish(new Error('Office XML decompression limit exceeded'));return;}chunks.push(chunk);});
    stream.on('error',(error:Error)=>finish(error));stream.on('end',()=>finish());
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();else stream.resume();
  });
}

/** Inspect media sizes without expanding them; inflate and validate only bounded XML. */
export async function openOfficeArchive(buffer:Buffer,limits:OfficeArchiveLimits={},signal?:AbortSignal):Promise<JSZip>{
  signal?.throwIfAborted();
  const archiveLimit=limits.maxOfficeArchiveBytes??MAX_FILE_BYTES,xmlLimit=limits.maxOfficeXmlBytes??DEFAULT_OFFICE_XML_BYTES;
  if(!Number.isSafeInteger(archiveLimit)||archiveLimit<1024||archiveLimit>MAX_FILE_BYTES||!Number.isSafeInteger(xmlLimit)||xmlLimit<1024||xmlLimit>256*1024*1024)throw new Error('Invalid Office archive limits');
  const zip=await JSZip.loadAsync(buffer,{createFolders:false}),entries=Object.values(zip.files);
  if(entries.length>5000)throw new Error('Office archive entry limit exceeded');
  let total=0,declaredXml=0;
  for(const entry of entries){
    signal?.throwIfAborted();
    const original=entry.unsafeOriginalName??entry.name;
    if(original.startsWith('/')||original.includes('\\')||original.includes(':')||original.split('/').includes('..'))throw new Error('Unsafe Office archive part path');
    const size=Number((entry as any)._data?.uncompressedSize??0);
    if(!Number.isSafeInteger(size)||size<0)throw new Error('Invalid Office archive part size');
    total+=size;if(total>archiveLimit)throw new Error('Office archive decompression limit exceeded: configured maxOfficeArchiveBytes');
    if(!entry.dir&&/\.(xml|rels)$/i.test(entry.name)){declaredXml+=size;if(declaredXml>xmlLimit)throw new Error('Office XML decompression limit exceeded: configured maxOfficeXmlBytes');}
  }
  let inflatedXml=0;
  for(const entry of entries){
    if(entry.dir||!/\.(xml|rels)$/i.test(entry.name))continue;
    const data=await boundedPart(entry,xmlLimit-inflatedXml,signal);inflatedXml+=data.length;
    const text=data.toString('utf8');
    if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('Unsafe or invalid Office XML');
    // Reuse validated XML without a second inflation. Keep untouched media compressed.
    zip.file(entry.name,data,{date:entry.date,createFolders:false});
  }
  return zip;
}
