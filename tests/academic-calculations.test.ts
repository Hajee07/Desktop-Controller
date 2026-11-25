import{test,before,after}from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import path from'node:path';
import{defaultConfig}from'../src/config/index.js';
import{createContext}from'../src/server/context.js';
import{calculate,calculationTools}from'../src/academic/calculations/index.js';
import{extractDocument}from'../src/academic/extraction/index.js';
import type{CallContext}from'../src/server/types.js';
let project:string,folder:string;let ctx:Awaited<ReturnType<typeof createContext>>;const file=(name:string)=>path.join(folder,name);const call:CallContext={signal:new AbortController().signal,async confirm(){throw new Error('No dialog expected');}};
async function invoke(name:string,input:Record<string,unknown>){const tool=calculationTools(ctx).find(t=>t.name===name)!;return await tool.execute(tool.schema.parse(input),call)as any;}
before(async()=>{await fs.mkdir('test-results',{recursive:true});project=await fs.mkdtemp(path.resolve('test-results/academic-calculation-'));folder=path.join(project,'workspace');await fs.mkdir(folder);ctx=await createContext(defaultConfig(project),project);});
after(async()=>{await ctx.shutdown();assert.ok(project.startsWith(path.resolve('test-results')+path.sep));await fs.rm(project,{recursive:true,force:true});});
test('bounded arithmetic evaluates supplied variables and meaningful expected checks',async()=>{
 assert.equal(calculate('2 + 3 * 4'),14);assert.equal(calculate('sqrt(9)+pow(2,3)'),11);assert.equal(calculate('distance / time',{distance:100,time:4}),25);
 const result=await invoke('academic_calculate',{calculations:[{id:'speed',expression:'distance/time',variables:{distance:100,time:4},unit:'m/s',expected:25},{id:'wrong expected',expression:'3*3',expected:8}]});assert.equal(result.results[0].passed,true);assert.equal(result.results[1].passed,false);assert.equal(result.unitValidation,'needs_review');
 for(const expression of ['process.exit(0)','globalThis.constructor','1;2','sqrt(-1)','1/0','__proto__','Function(2)','2**3'])assert.throws(()=>calculate(expression),undefined,expression);
});
test('ROUND matches spreadsheet half-away-from-zero convention',()=>{assert.equal(calculate('ROUND(-1.5,0)'),-2);assert.equal(calculate('ROUND(1.5,0)'),2);});
test('Excel formulas use Excel power and unary precedence while arithmetic keeps mathematical convention',async()=>{
 assert.equal(calculate('2^3^2'),512);assert.equal(calculate('-2^2'),-4);assert.equal(calculate('2^3^2',{},undefined,'excel'),64);assert.equal(calculate('-2^2',{},undefined,'excel'),4);
 const result=await invoke('academic_spreadsheet_generate',{path:file('excel-dialect.xlsx'),title:'Dialect checks',cells:[{address:'A1',formula:'2^3^2'},{address:'A2',formula:'-2^2'},{address:'A3',formula:'ROUND(-1.5,0)'},{address:'B1',value:true},{address:'B2',value:2},{address:'C1',formula:'SUM(B1:B2)'}],dryRun:false});assert.equal(result.computedValues.A1,64);assert.equal(result.computedValues.A2,4);assert.equal(result.computedValues.A3,-2);assert.equal(result.computedValues.C1,2);
 const source=await extractDocument(ctx,result.path,call);const formula=(source.metadata.formulas as any[]).find(f=>f.location.cell==='A1');assert.equal(formula.cachedValue,'64');
});
test('generated XLSX stores real supported formulas with independently calculated values',async()=>{
 const input={path:file('calculations.xlsx'),title:'Supplied measurements',cells:[{address:'A1',value:10},{address:'A2',value:20},{address:'A3',value:30},{address:'B1',formula:'SUM(A1:A3)'},{address:'B2',formula:'AVERAGE(A1:A3)'},{address:'B3',formula:'B1/B2'}]};
 const preview=await invoke('academic_spreadsheet_generate',input);assert.equal(preview.dryRun,true);assert.equal(preview.computedValues.B1,60);assert.equal(preview.computedValues.B2,20);assert.equal(preview.computedValues.B3,3);await assert.rejects(()=>fs.stat(input.path));await invoke('academic_spreadsheet_generate',{...input,dryRun:false});const doc=await extractDocument(ctx,input.path,call);assert.equal(doc.metadata.formulasEvaluated,false);assert.ok((doc.metadata.formulas as any[]).some(f=>f.formula==='SUM(A1:A3)'&&f.cachedValue==='60'));await assert.rejects(()=>invoke('academic_spreadsheet_generate',{...input,dryRun:false}),/exist/i);
});
test('cycles duplicates excessive ranges and arbitrary/external formulas are rejected',async()=>{
 const cases=[[{address:'A1',formula:'B1'},{address:'B1',formula:'A1'}],[{address:'A1',value:1},{address:'A1',value:2}],[{address:'A1',formula:'SUM(B1:B6000)'}],[{address:'A1',formula:'WEBSERVICE("https://example.test")'}],[{address:'A1',formula:'[external.xlsx]Sheet1!A2'}]];
 for(const cells of cases)await assert.rejects(()=>invoke('academic_spreadsheet_generate',{path:file('unsafe.xlsx'),title:'Unsafe fixture',cells,dryRun:false}));await assert.rejects(()=>fs.stat(file('unsafe.xlsx')));
});
