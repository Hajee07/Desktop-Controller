import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';

export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

/** Hash the entire file with bounded memory; never buffer a multi-GB file. */
export async function hashFile(filename:string,maxBytes:number,signal?:AbortSignal):Promise<string> {
  signal?.throwIfAborted();
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(filename,{highWaterMark:1024*1024,signal})) {
    bytes+=chunk.length;
    if(bytes>maxBytes)throw new Error('File grew beyond the configured size limit.');
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/** Validate the entire UTF-8 source, retaining only the existing response-size budget. */
export async function readTextPrefix(filename:string,maxBytes:number,maxCharacters:number,signal?:AbortSignal):Promise<{text:string;truncated:boolean}> {
  signal?.throwIfAborted();
  const decoder=new StringDecoder('utf8');let bytes=0,text='',truncated=false;
  const append=(part:string)=>{
    const available=maxCharacters-text.length;
    if(part.length>available)truncated=true;
    if(available>0)text+=part.slice(0,available);
  };
  for await(const chunk of createReadStream(filename,{highWaterMark:64*1024,signal})) {
    bytes+=chunk.length;
    if(bytes>maxBytes)throw new Error('File grew beyond the configured size limit.');
    if(chunk.includes(0))throw new Error('Binary content cannot be read as an ordinary text file.');
    append(decoder.write(chunk));
  }
  append(decoder.end());
  return {text,truncated};
}
