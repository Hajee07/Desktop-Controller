import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { PDFParse } from 'pdf-parse';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel } from 'docx';
import PptxGenJS from 'pptxgenjs';
import {readTextPrefix} from '../utils/files.js';
import {openOfficeArchive,type OfficeArchiveLimits} from '../utils/office-archive.js';
import {MAX_EXTRACTED_TEXT_CHARACTERS} from '../utils/text-limits.js';

export const textExtensions = new Set(['.txt','.md','.json','.csv','.html','.htm','.css','.js','.jsx','.mjs','.cjs','.ts','.tsx','.py','.c','.cpp','.h','.hpp','.java','.xml','.yaml','.yml','.toml','.log','.sql','.gitignore','.properties','.gradle']);
export const documentExtensions = new Set([...textExtensions, '.pdf','.docx','.xlsx','.pptx']);
const MAX_TEXT = MAX_EXTRACTED_TEXT_CHARACTERS;

function aborted(signal?: AbortSignal) { signal?.throwIfAborted(); }

const inspectArchive=openOfficeArchive;

function wordText(nodes:any[]):string {
  return nodes.map(node=>{
    const name=Object.keys(node).find(k=>k!==':@');if(!name)return '';
    if(name==='#text')return String(node[name]);
    if(name==='w:tab')return '\t';if(name==='w:br'||name==='w:cr')return '\n';
    const content=Array.isArray(node[name])?wordText(node[name]):'';
    return content+(name==='w:p'?'\n\n':name==='w:tr'?'\n':'');
  }).join('');
}

function xmlText(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(xmlText);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => key === 'a:p' ? array(nested).map(paragraph => xmlText(paragraph).join('')) : key === 'a:t' ? xmlText(nested) : typeof nested === 'object' ? xmlText(nested) : []);
}

/** Extract text only. No Office macros, hyperlinks, formulas, or embedded programs run. */
export async function readDocument(filename: string, maxBytes: number, signal?: AbortSignal,officeLimits:OfficeArchiveLimits&{maxDocumentProcessingBytes?:number}={}): Promise<{format: string; text: string; truncated: boolean}> {
  aborted(signal);
  const stat = await fs.stat(filename);
  if (!stat.isFile()) throw new Error('A regular file is required.');
  if (stat.size > maxBytes) throw new Error(`File exceeds the configured ${maxBytes}-byte read limit.`);
  const ext = path.extname(filename).toLowerCase() || path.basename(filename).toLowerCase();
  if (!documentExtensions.has(ext)) throw new Error(`Unsupported document format: ${ext || '(none)'}`);
  if (textExtensions.has(ext)) return {format:ext.substring(1),...await readTextPrefix(filename,maxBytes,MAX_TEXT,signal)};
  if(stat.size>(officeLimits.maxDocumentProcessingBytes??256*1024*1024))throw new Error('DOCUMENT_PROCESSING_LIMIT: use filesystem_read_chunk for large binary sources; file storage limit is independent');
  const buffer = await fs.readFile(filename, { signal });
  let text = '';
  if (ext === '.pdf') {
    const parser = new PDFParse({ data: buffer });
    try { text = (await parser.getText()).text; }
    finally { await parser.destroy(); }
  } else {
    const zip = await inspectArchive(buffer,officeLimits,signal);
    aborted(signal);
    if (ext === '.docx') {
      const main=zip.file('word/document.xml');if(!main)throw new Error('Missing Office document part: word/document.xml');
      text=wordText(new XMLParser({preserveOrder:true,ignoreAttributes:true,parseTagValue:false,trimValues:false}).parse(await main.async('string')));
    }
    else if (ext === '.xlsx') {
      text = await readSpreadsheet(zip, signal);
    } else {
      const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, parseTagValue: false, trimValues: false });
      const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
      const lines: string[] = [];
      let length = 0;
      for (const name of slides) {
        aborted(signal);
        const xml = await zip.file(name)!.async('string');
        if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Unsafe or invalid presentation XML.');
        const slideText = xmlText(parser.parse(xml)).join('\n');
        lines.push(`[${path.basename(name, '.xml')}]\n${slideText}`);
        length += slideText.length;
        if (length > MAX_TEXT) break;
      }
      text = lines.join('\n\n');
    }
  }
  aborted(signal);
  return { format: ext.substring(1), text: text.slice(0,MAX_TEXT), truncated: text.length > MAX_TEXT };
}

export type ReportCell = string | number | boolean | null;
export interface Report { title: string; columns: string[]; rows: ReportCell[][] }
export const reportFormats = ['txt','md','json','csv','html','pdf','docx','xlsx','pptx'] as const;
function escapeHtml(input: unknown): string { return String(input ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!)); }
function escapeXml(input: unknown): string { return escapeHtml(String(input ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')); }
function array<T>(value:T|T[]|undefined):T[] { return value===undefined?[]:Array.isArray(value)?value:[value]; }
async function safeXml(zip:JSZip,name:string) {
  const entry = zip.file(name);
  if(!entry)throw new Error(`Missing Office document part: ${name}`);
  const xml = await entry.async('string');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('Unsafe or invalid Office XML.');
  return new XMLParser({ignoreAttributes:false,processEntities:true,parseTagValue:false,trimValues:false,attributeNamePrefix:'@_'}).parse(xml);
}
function stringContent(input:any):string {
  if(typeof input==='string'||typeof input==='number')return String(input);
  if(!input||typeof input!=='object')return '';
  if(input.t!==undefined)return typeof input.t==='object'?String(input.t['#text']??''):String(input.t);
  if(input.r!==undefined)return array(input.r).map(stringContent).join('');
  return String(input['#text']??'');
}
async function readSpreadsheet(zip:JSZip,signal?:AbortSignal):Promise<string> {
  const shared=zip.file('xl/sharedStrings.xml')?array((await safeXml(zip,'xl/sharedStrings.xml')).sst?.si).map(stringContent):[];
  const workbook=await safeXml(zip,'xl/workbook.xml');
  const rels=array((await safeXml(zip,'xl/_rels/workbook.xml.rels')).Relationships?.Relationship);
  const lines:string[]=[];
  let total=0;
  for(const sheet of array(workbook.workbook?.sheets?.sheet) as any[]) {
    aborted(signal);
    const rel=rels.find((item:any)=>item['@_Id']===sheet['@_r:id']);
    if(!rel||rel['@_TargetMode']==='External')continue;
    const target=String(rel['@_Target']??'');
    const part=target.startsWith('/')?target.slice(1):path.posix.normalize(path.posix.join('xl',target));
    if(!/^xl\/worksheets\/[^/]+\.xml$/.test(part))throw new Error('Unexpected worksheet archive path.');
    const xml=await safeXml(zip,part);
    lines.push(`[${sheet['@_name']??'Sheet'}]`);
    for(const row of array(xml.worksheet?.sheetData?.row) as any[]) {
      aborted(signal);
      const values:string[]=[];
      for(const c of array(row.c) as any[]) {
        const type=c['@_t'];
        const ref=String(c['@_r']??'');
        const letters=ref.match(/^[A-Z]+/)?.[0];
        const column=letters?[...letters].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1:values.length;
        if(column<0||column>16383)throw new Error('Invalid spreadsheet cell reference.');
        const value=type==='s'?String(shared[Number(c.v)]??''):type==='inlineStr'?stringContent(c.is):c.v!==undefined?String(c.v):c.f?'[formula without cached result]':'';
        values[column]=value;
      }
      const line=values.join('\t');
      total+=line.length;
      lines.push(line);
      if(total>MAX_TEXT)return lines.join('\n');
    }
  }
  return lines.join('\n');
}
function columnName(index:number):string { let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name; }
async function writeSpreadsheet(report:Report):Promise<Buffer> {
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml','<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF253D63"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
  const rows:ReportCell[][]=[[report.title],report.columns,...report.rows];
  const xml=rows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>{
    const ref=`${columnName(c)}${r+1}`;const style=r===1?' s="1"':'';
    if(typeof value==='number')return `<c r="${ref}"${style}><v>${value}</v></c>`;
    if(typeof value==='boolean')return `<c r="${ref}" t="b"${style}><v>${value?1:0}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  zip.file('xl/worksheets/sheet1.xml',`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${report.columns.length}" width="22" customWidth="1"/></cols><sheetData>${xml}</sheetData></worksheet>`);
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
function csvCell(input: ReportCell): string {
  let value = String(input ?? '');
  if (/^[\t\r\n ]*[=+@-]/.test(value)) value = `'${value}`;
  return `"${value.replace(/"/g,'""')}"`;
}
function markdownCell(input: ReportCell): string { return String(input ?? '').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' '); }

export async function renderReport(format: typeof reportFormats[number], report: Report, signal?: AbortSignal): Promise<Buffer> {
  aborted(signal);
  if (report.rows.some(row => row.length !== report.columns.length)) throw new Error('Each row must have exactly one cell per column.');
  if (JSON.stringify(report).length > 1_000_000) throw new Error('Report data exceeds the 1 MB limit.');
  if (format === 'json') return Buffer.from(JSON.stringify(report,null,2)+'\n');
  if (format === 'csv') return Buffer.from([report.columns.map(csvCell).join(','),...report.rows.map(row => row.map(csvCell).join(','))].join('\r\n')+'\r\n');
  if (format === 'txt') return Buffer.from([report.title,report.columns.join('\t'),...report.rows.map(row=>row.map(x=>String(x??'')).join('\t'))].join('\n')+'\n');
  if (format === 'md') return Buffer.from(`# ${report.title.replace(/[\r\n]+/g,' ')}\n\n| ${report.columns.map(markdownCell).join(' | ')} |\n| ${report.columns.map(()=>'---').join(' | ')} |\n${report.rows.map(row=>'| '+row.map(markdownCell).join(' | ')+' |').join('\n')}\n`);
  if (format === 'html') return Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font:16px system-ui;margin:3rem;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cdd4df;padding:.6rem;text-align:left}th{background:#eaf0f8}h1{font-size:1.6rem}</style><h1>${escapeHtml(report.title)}</h1><table><thead><tr>${report.columns.map(col=>`<th>${escapeHtml(col)}</th>`).join('')}</tr></thead><tbody>${report.rows.map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></html>`);
  if (format === 'xlsx') {
    return writeSpreadsheet(report);
  }
  if (format === 'docx') {
    const rows = [report.columns,...report.rows].map((row,i)=>new TableRow({children:row.map(cell=>new TableCell({children:[new Paragraph({text:String(cell??''),...(i===0?{heading:HeadingLevel.HEADING_3}:{})})]}))}));
    return Packer.toBuffer(new Document({sections:[{children:[new Paragraph({text:report.title,heading:HeadingLevel.TITLE}),new Table({rows})]}]}));
  }
  if (format === 'pptx') {
    // Vendor package declares CJS types for its ESM default constructor.
    const deck = new (PptxGenJS as any)();
    deck.layout = 'LAYOUT_WIDE';
    deck.author = 'Windows Laptop Control MCP';
    deck.subject = report.title;
    const perSlide = 12;
    for (let start = 0; start < Math.max(1,report.rows.length); start += perSlide) {
      const slide = deck.addSlide();
      slide.addText(report.title,{x:.5,y:.35,w:12.3,h:.6,fontSize:24,bold:true,color:'253D63'});
      const data = [report.columns,...report.rows.slice(start,start+perSlide)].map((row,i)=>row.map(cell=>({text:String(cell??''),options:{bold:i===0,fill:i===0?'EAF0F8':'FFFFFF'}})));
      slide.addTable(data,{x:.5,y:1.2,w:12.3,fontSize:12,border:{pt:.5,color:'CCD4DF'},margin:.08,autoPage:true});
    }
    return Buffer.from(await deck.write({outputType:'nodebuffer'}) as Buffer);
  }
  const pdf = new PDFDocument({size:'A4',margin:45,info:{Title:report.title,Author:'Windows Laptop Control MCP'}});
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});
  pdf.fontSize(20).text(report.title).moveDown();
  pdf.fontSize(10).text(report.columns.join(' | ')).moveDown(.5);
  for (const row of report.rows) { aborted(signal); pdf.text(row.map(cell=>String(cell??'')).join(' | ')).moveDown(.3); }
  pdf.end();
  return complete;
}
