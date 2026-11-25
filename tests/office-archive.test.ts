import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import {defaultConfig,configSchema} from '../src/config/index.js';
import {createContext} from '../src/server/context.js';
import {filesystemTools} from '../src/filesystem/index.js';
import {extractDocument} from '../src/academic/extraction/index.js';
import {documentTools} from '../src/academic/documents/index.js';
import {renderReport} from '../src/filesystem/documents.js';
import {openOfficeArchive} from '../src/utils/office-archive.js';
import {hashFile,MAX_FILE_BYTES} from '../src/utils/files.js';
import type {CallContext} from '../src/server/types.js';

const xml=(text:string)=>`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
const call:CallContext={signal:new AbortController().signal,confirm:async()=>{throw new Error('Read-only fixture must not request GUI approval');}};

test('media above 40 MiB is read through filesystem, academic, style, quality and patch-preview tools',async t=>{
  const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});const project=await fs.mkdtemp(path.join(base,'office-media-'));await fs.mkdir(path.join(project,'workspace'));
  const ctx=await createContext(defaultConfig(project),project);t.after(async()=>{await ctx.shutdown();assert.equal(path.dirname(await fs.realpath(project)),base);await fs.rm(project,{recursive:true,force:true});});
  const zip=await JSZip.loadAsync(await renderReport('docx',{title:'Media fixture',columns:['Item'],rows:[['Known answer text']]}));
  zip.file('word/media/unrequested.bin',Buffer.alloc(48*1024*1024,42));
  const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),source=path.join(project,'workspace','media.docx');await fs.writeFile(source,buffer);
  const all=[...filesystemTools(ctx),...documentTools(ctx)];const run=async(name:string,input:any)=>{const tool=all.find(t=>t.name===name)!;return await tool.execute(tool.schema.parse(input),call)as any;};
  const read=await run('filesystem_read',{path:source});assert.match(read.text,/Known answer text/);
  const academic=await extractDocument(ctx,source,call);assert.ok(academic.segments.some(s=>s.text.includes('Known answer text')));
  const style=await run('academic_style_analyse',{path:source});assert.ok(style.measured.paragraphs>0);
  const quality=await run('academic_document_quality',{path:source,requiredText:['Known answer text']});assert.equal(quality.machineChecksPassed,true);
  const preview=await run('academic_document_patch',{source,path:path.join(project,'workspace','edited.docx'),expectedSha256:read.sha256,replacements:[{find:'Known answer text',replace:'Replacement'}]});assert.equal(preview.dryRun,true);
  assert.equal(await hashFile(source,MAX_FILE_BYTES),read.sha256);
  const opened=await openOfficeArchive(buffer);assert.ok((opened.file('word/media/unrequested.bin')as any)._data.compressedContent,'Media remains compressed after reading XML');
  await assert.rejects(()=>openOfficeArchive(buffer,{maxOfficeArchiveBytes:40*1024*1024}),/archive decompression limit/);
});

test('XML budgets, malformed XML, entities, entry count and unsafe paths are still rejected',async()=>{
  const zip=new JSZip();zip.file('word/document.xml',xml('A'.repeat(2048)));const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  await assert.rejects(()=>openOfficeArchive(buffer,{maxOfficeXmlBytes:1024}),/XML decompression limit/);
  zip.file('word/document.xml','<!DOCTYPE a [<!ENTITY b "bad">]>'+xml('test'));await assert.rejects(()=>zip.generateAsync({type:'nodebuffer'}).then(b=>openOfficeArchive(b)),/Unsafe/);
  zip.file('word/document.xml','<broken>');await assert.rejects(()=>zip.generateAsync({type:'nodebuffer'}).then(b=>openOfficeArchive(b)),/invalid/);
  const unsafe=new JSZip();unsafe.file('../outside.xml','<a/>');await assert.rejects(()=>unsafe.generateAsync({type:'nodebuffer'}).then(b=>openOfficeArchive(b)),/Unsafe.*path/);
  const many=new JSZip();for(let i=0;i<5001;i++)many.file('part'+i,'');await assert.rejects(()=>many.generateAsync({type:'nodebuffer'}).then(b=>openOfficeArchive(b)),/entry limit/);
  const config=defaultConfig(path.resolve('.'));assert.equal(config.maxOfficeArchiveBytes,MAX_FILE_BYTES);assert.equal(config.maxOfficeXmlBytes,40*1024*1024);
  assert.throws(()=>configSchema.parse({...config,maxOfficeArchiveBytes:MAX_FILE_BYTES+1}));
});

test('actual XML inflation is bounded even when ZIP metadata understates the size; cancellation is honored',async()=>{
  const zip=new JSZip();zip.file('word/document.xml',xml('A'.repeat(512*1024)));const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  const central=buffer.indexOf(Buffer.from('504b0102','hex'));assert.ok(central>=0);buffer.writeUInt32LE(100,central+24);
  await assert.rejects(()=>openOfficeArchive(buffer,{maxOfficeXmlBytes:1024}),/XML decompression limit/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>openOfficeArchive(buffer,{},controller.signal));
});
