import {openOfficeArchive} from '../utils/office-archive.js';
import {reserveOutput} from '../storage/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import type { AppContext, CallContext } from '../server/types.js';
import { checkedFile } from './common.js';
import { approvedPowerShell } from '../utils/powershell.js';

export interface OcrResult {
  text: string;
  lines: { text: string; bounds?: { x: number; y: number; width: number; height: number } }[];
  language: string;
  warnings: string[];
  width?: number;
  height?: number;
  sourceSha256?: string;
}
export interface NativeCapabilities {
  platform: string;
  elevated: boolean;
  word: { available: boolean; executable?: string };
  ocr: { available: boolean; languages: { tag: string; displayName: string }[]; maxImageDimension?: number; error?: string };
  commands: Record<string, string[]>;
  isolation: { backend: 'none'; untrustedExecutionSupported: false };
}
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
function running(ctx: AppContext, call: CallContext) { call.signal.throwIfAborted(); ctx.emergency.assertRunning(); }

/** Fixed internal bridge. Model inputs are JSON data and never become PowerShell source/argv. */
async function native(ctx: AppContext, operation: 'capabilities'|'ocr'|'render-docx', payload: Record<string, unknown>, call: CallContext): Promise<any> {
  if (process.platform !== 'win32') throw new Error('ACADEMIC_NATIVE_UNAVAILABLE: Windows is required.');
  running(ctx, call);
  const script = path.join(ctx.projectDir, 'scripts', 'academic-native.ps1');
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  if (encoded.length > 40000) throw new Error('Academic native bridge payload exceeds its bound.');
  const result = await ctx.runProcess(await approvedPowerShell(),
    ['-NoLogo','-NoProfile','-NonInteractive','-STA','-File',script,'-Operation',operation,'-Payload',encoded],
    { signal: call.signal, timeoutMs: ctx.config.toolTimeoutMs });
  running(ctx, call);
  if (result.exitCode !== 0) throw new Error(`ACADEMIC_NATIVE_FAILED: ${operation}: ${result.stderr.slice(0, 1500)}`);
  try { return JSON.parse(result.stdout.replace(/^\uFEFF/, '')); } catch { throw new Error('Invalid academic native bridge response.'); }
}

export async function nativeCapabilities(ctx: AppContext, call: CallContext): Promise<NativeCapabilities> {
  const result = await native(ctx, 'capabilities', {}, call);
  return { ...result, isolation: { backend: 'none', untrustedExecutionSupported: false } };
}

export async function ocrImage(ctx: AppContext, imagePath: string, language: string, call: CallContext): Promise<OcrResult> {
  running(ctx, call);
  const source = await ctx.paths.check(imagePath);
  if (!/\.(png|jpe?g|bmp|tiff?)$/i.test(source)) throw new Error('OCR requires an authorized PNG, JPEG, BMP, or TIFF image.');
  if (!/^(?:auto|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i.test(language)) throw new Error('OCR language must be auto or a BCP-47 language tag.');
  const snapshot = await checkedFile(ctx, source, call.signal);
  if (snapshot.buffer.length > 25_000_000) throw new Error('OCR input exceeds the configured ordinary-file limit.');
  const original = snapshot.sha256;
  const result = await native(ctx, 'ocr', { imagePath: source, language }, call);
  await ctx.paths.check(source);
  if ((await checkedFile(ctx, source, call.signal)).sha256 !== original) throw new Error('OCR source changed during processing; discard this result and retry.');
  if (typeof result.text !== 'string' || !Array.isArray(result.lines)) throw new Error('Invalid OCR result.');
  return { ...result, sourceSha256: original };
}

async function safeRenderSource(buffer: Buffer): Promise<void> {
  const zip = await openOfficeArchive(buffer);
  if (Object.keys(zip.files).length > 5000) throw new Error('DOCX archive has too many parts.');
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    total += Number((entry as any)._data?.uncompressedSize ?? 0);

    if (/vbaProject|word\/embeddings\/|customUI\//i.test(entry.name)) throw new Error('Active/embedded Office content is not accepted by the native renderer.');
    if (!entry.dir && /\.(xml|rels)$/i.test(entry.name)) {
      const xml = await entry.async('string');
      if (/<!DOCTYPE|<!ENTITY|macroEnabled|TargetMode\s*=\s*["']External["']|\b(?:DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|MACROBUTTON)\b/i.test(xml)) throw new Error('External links, active fields, or macros are not accepted by the native renderer. Generate a clean DOCX copy first.');
    }
  }
  if (!zip.file('word/document.xml')) throw new Error('Source is not a Word DOCX document.');
}

/** Export a clean authorized DOCX to a new authorized PDF; originals and existing outputs are never modified. */
export async function renderDocx(ctx: AppContext, sourcePath: string, outputPath: string, call: CallContext): Promise<Record<string, unknown>> {
  running(ctx, call);
  const source = await ctx.paths.check(sourcePath);
  const output = await ctx.paths.check(outputPath, 'write');
  if (!/\.docx$/i.test(source) || !/\.pdf$/i.test(output)) throw new Error('Rendering requires a DOCX source and a new PDF output.');
  const snapshot = await checkedFile(ctx, source, call.signal);
  const input = snapshot.buffer;
  await safeRenderSource(input);
  const sourceHash = sha(input);
  if (await fs.lstat(output).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Output PDF already exists; choose a new filename.');
  const parent = await ctx.paths.check(path.dirname(output));
  if (!(await fs.stat(parent)).isDirectory()) throw new Error('Output parent must be an existing authorized directory.');
  const stage = path.join(parent, `mcp-render-${randomUUID()}`);
  await ctx.paths.check(stage, 'write');
  running(ctx, call);
  const releaseStorage=await reserveOutput(ctx,output,Math.min(ctx.config.maxReadBytes,input.length*2+8*1024*1024),call.signal);
  await fs.mkdir(stage);
  const stagedPdf = path.join(stage, 'rendered.pdf');
  const ownership = path.join(stage, 'owned-word.json');
  try {
    const result = await native(ctx, 'render-docx', { source, outputPdf: stagedPdf, ownershipReportPath: ownership }, call);
    running(ctx, call);
    await ctx.paths.check(source);
    if ((await checkedFile(ctx, source, call.signal)).sha256 !== sourceHash) throw new Error('Source DOCX changed during rendering. Output was not published.');
    const staged = await ctx.paths.check(stagedPdf);
    const rendered = await fs.readFile(staged, { signal: call.signal });
    if (!rendered.subarray(0, 5).equals(Buffer.from('%PDF-')) || rendered.length < 100) throw new Error('Word did not produce a valid PDF.');
    await ctx.paths.check(output, 'write');
    running(ctx, call);
    await fs.link(staged, output); // Exclusive create: concurrent output creation is never overwritten.
    await fs.unlink(staged);
    return { ...result, source, outputPdf: output, sourceSha256: sourceHash, outputSha256: sha(rendered), sourceUnchanged: true, warnings: ['Page layout was rendered by the locally installed Microsoft Word version; inspect page images before final submission.'] };
  } finally {
    await fs.unlink(ownership).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.unlink(stagedPdf).catch(error => { if (error.code !== 'ENOENT') throw error; });
    // Delete only the empty staging directory we created, never recursively delete its contents.
    await fs.rmdir(stage).catch(error => { if (!['ENOENT','ENOTEMPTY'].includes(error.code)) throw error; });
    releaseStorage();
  }
}
