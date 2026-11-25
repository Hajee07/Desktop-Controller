import{Worker}from'node:worker_threads';
/** Corpus-trained latent semantic analysis: sparse TF-IDF + truncated SVD by seeded power iteration. */
export interface LsaModel {method:'corpus_lsa_tfidf_truncated_svd';version:1;vocabulary:string[];idf:number[];basis:number[][];vectors:{id:string;values:number[]}[];corpusFingerprint:string;builtAt:string;limitations:string}
const stop=new Set('the a an is are was were be been being of to and or in on at by for from with this that these those it its as into not we you they their our can will may'.split(' '));
export function tokens(text:string):string[]{return(text.toLowerCase().match(/[\p{L}\p{N}]{2,40}/gu)??[]).filter(t=>!stop.has(t));}
const dot=(a:number[],b:number[])=>a.reduce((n,v,i)=>n+v*(b[i]??0),0);
function normalize(v:number[]):number[]{const length=Math.sqrt(dot(v,v));return length>1e-12?v.map(x=>x/length):v.map(()=>0);}
export function cosine(a:number[],b:number[]):number{return dot(normalize(a),normalize(b));}
export function fitLsa(documents:{id:string;text:string}[],dimensions:number,corpusFingerprint:string):LsaModel{
 const counts=documents.map(d=>{const map=new Map<string,number>();for(const token of tokens(d.text))map.set(token,(map.get(token)??0)+1);return map;});
 const frequencies=new Map<string,number>();for(const count of counts)for(const term of count.keys())frequencies.set(term,(frequencies.get(term)??0)+1);
 const vocabulary=[...frequencies].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,600).map(([term])=>term);const lookup=new Map(vocabulary.map((term,i)=>[term,i]));
 if(documents.length<3||vocabulary.length<3)throw new Error('LSA needs at least three nonempty text chunks and three vocabulary terms');
 const idf=vocabulary.map(term=>1+Math.log((documents.length+1)/((frequencies.get(term)??0)+1)));
 const matrix=counts.map(count=>{const terms:{index:number;value:number}[]=[];for(const [term,n]of count){const index=lookup.get(term);if(index!==undefined)terms.push({index,value:(1+Math.log(n))*idf[index]});}const length=Math.sqrt(terms.reduce((sum,t)=>sum+t.value*t.value,0));return terms.map(t=>({...t,value:t.value/(length||1)}));});
 function multiply(u:number[]):number[]{const out=new Array(vocabulary.length).fill(0);for(const doc of matrix){let weight=0;for(const t of doc)weight+=u[t.index]*t.value;for(const t of doc)out[t.index]+=weight*t.value;}return out;}
 let seed=17359;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296-.5;};const basis:number[][]=[];
 const orthogonal=(v:number[])=>{for(const u of basis){const projection=dot(v,u);for(let i=0;i<v.length;i++)v[i]-=projection*u[i];}return normalize(v);};
 for(let component=0;component<Math.min(dimensions,vocabulary.length-1,documents.length-1);component++){
  let u=orthogonal(vocabulary.map(random));for(let iteration=0;iteration<45;iteration++){const next=orthogonal(multiply(u));const convergence=Math.abs(dot(u,next));u=next;if(convergence>.999999)break;}
  if(Math.sqrt(dot(multiply(u),multiply(u)))<1e-7)break;basis.push(u);
 }
 const vectors=documents.map((doc,i)=>({id:doc.id,values:basis.map(u=>matrix[i].reduce((sum,t)=>sum+u[t.index]*t.value,0))}));
 return{method:'corpus_lsa_tfidf_truncated_svd',version:1,vocabulary,idf,basis,vectors,corpusFingerprint,builtAt:new Date().toISOString(),limitations:'Corpus-specific co-occurrence embeddings, not an external language model. Small or narrow corpora may miss paraphrases; unseen query terms are ignored. Refit after index updates.'};
}
export function embedQuery(model:LsaModel,query:string):{vector:number[];knownTerms:number;unknownTerms:string[]}{
 const count=new Map<string,number>();for(const t of tokens(query))count.set(t,(count.get(t)??0)+1);const vector=model.vocabulary.map((term,i)=>count.has(term)?(1+Math.log(count.get(term)!))*model.idf[i]:0);const known=new Set(model.vocabulary);return{vector:model.basis.map(u=>dot(u,normalize(vector))),knownTerms:[...count.keys()].filter(t=>known.has(t)).length,unknownTerms:[...count.keys()].filter(t=>!known.has(t))};
}
/** CPU work stays off the MCP event loop so timeout/emergency cancellation remains responsive. */
export async function fitLsaAsync(documents:{id:string;text:string}[],dimensions:number,corpusFingerprint:string,options:{signal:AbortSignal;timeoutMs:number}):Promise<LsaModel>{
 options.signal.throwIfAborted();
 const moduleUrl=new URL(import.meta.url.endsWith('.ts')?'./lsa.ts':'./lsa.js',import.meta.url).href;
 return new Promise<LsaModel>((resolve,reject)=>{
  const worker=new Worker(`import{parentPort,workerData}from'node:worker_threads';import(workerData.moduleUrl).then(m=>m.fitLsa(workerData.documents,workerData.dimensions,workerData.fingerprint)).then(model=>parentPort.postMessage({ok:true,model})).catch(error=>parentPort.postMessage({ok:false,error:String(error.message||error)}));`,{eval:true,execArgv:['--input-type=module'],workerData:{moduleUrl,documents,dimensions,fingerprint:corpusFingerprint},resourceLimits:{maxOldGenerationSizeMb:128}});
  let settled=false;
  const finish=(error?:Error,model?:LsaModel)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal.removeEventListener('abort',abort);const completed=()=>{if(error)reject(error);else resolve(model!);};void worker.terminate().then(completed,completed);};
  const abort=()=>finish(new Error('LSA training cancelled'));
  const timer=setTimeout(()=>finish(new Error('LSA training timed out')),options.timeoutMs);
  options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted)abort();
  worker.once('message',message=>message.ok?finish(undefined,message.model):finish(new Error(message.error)));
  worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!settled)finish(new Error('LSA worker exited '+code));});
 });
}
