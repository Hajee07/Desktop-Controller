import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {z} from 'zod';
import {approvedPowerShell} from '../utils/powershell.js';
import type {AppContext,ToolDefinition,CallContext} from '../server/types.js';

export function packetTracerTools(ctx:AppContext):ToolDefinition[]{
 const catalogPath=path.join(ctx.projectDir,'integrations','packet-tracer-catalog.json');
 if(!fs.existsSync(catalogPath))return [];
 let catalog:any;try{catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8').replace(/^\uFEFF/,''));}catch{return [];}
 if(!Array.isArray(catalog))return [];
 const nativeTools:ToolDefinition[]=[{name:'packet_tracer_open_device_cli',description:'Open an exact named Packet Tracer device using its accessible workspace table. Select terminal=CLI for IOS or terminal=Desktop for PC/server Desktop Command Prompt. No cursor movement; verify returned window identity before capture. Requires unlocked desktop and recent presence.',schema:z.object({name:z.string().min(1).max(128),terminal:z.enum(['CLI','Desktop']).default('CLI'),processId:z.number().int().positive(),windowHandle:z.number().int().positive(),dryRun:z.boolean().default(true)}).strict(),readOnly:false,async execute(i,c){
  if(!ctx.config.desktop.enabled||!ctx.config.desktop.allowedProcesses.some(p=>/^PacketTracer(?:\.exe)?$/i.test(p)))throw new Error('Packet Tracer desktop access disabled');
  if(i.dryRun)return {dryRun:true,device:i.name,processId:i.processId};
  const processes=await ctx.runPowerShell('applications',{kind:'running'},c.signal);
  if(!(Array.isArray(processes)?processes:[processes]).some(p=>p.processId===i.processId&&/^PacketTracer$/i.test(p.processName)))throw new Error('PACKET_TRACER_PROCESS_REQUIRED');
  await ctx.runPowerShell('inspect',{windowHandle:i.windowHandle,processId:i.processId,maxElements:1,allowedProcesses:['PacketTracer'],presenceMaxIdleSeconds:ctx.config.desktop.presenceMaxIdleSeconds},c.signal);
  const result=await ctx.runProcess(await approvedPowerShell(),['-NoLogo','-NoProfile','-NonInteractive','-STA','-File',path.join(ctx.projectDir,'scripts','packet-tracer-ui.ps1'),'-ProcessId',String(i.processId),'-DeviceName',i.name,'-TargetTab',i.terminal],{signal:c.signal,timeoutMs:20000});
  if(result.exitCode!==0)throw new Error('PACKET_TRACER_UI_FAILED: '+result.stderr.slice(0,1200));
  return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
 }}];
 return [...nativeTools,...catalog.filter(t=>t.name!=='call_ipc_api').map(t=>({
  name:'packet_tracer_'+t.name,description:(t.name==='get_all_links'?'Returns cable endpoints. Packet Tracer 8.2 wireless Antenna entries are excluded; this list may be shorter than the total network link count. ':t.name==='send_cli_command'?'Engine execution: output may NOT appear in the visible CLI. For genuine CLI screenshot evidence use packet_tracer_send_terminal_command after packet_tracer_open_device_cli. ':t.name==='send_terminal_command'?'Visible console execution: commands and output appear in the actual device CLI; use this for screenshot evidence. Preserve the current console mode and inspect prompts. ':'')+t.description,
  schema:z.fromJSONSchema(t.inputSchema),readOnly:t.annotations?.readOnlyHint===true,
  destructive:t.annotations?.destructiveHint===true,
  async execute(input:any,call:CallContext){
   // File tools are the only upstream operations accepting local filesystem paths.
   if(t.name==='open_network_file'||t.name==='save_network_file'){
    if(!path.isAbsolute(input.path)||!/\.(pkt|pka)$/i.test(input.path))throw new Error('Absolute authorized PKT/PKA path required');
    await ctx.paths.check(input.path,t.name==='save_network_file'?'write':'read');
   }
   const mutation=t.annotations?.readOnlyHint!==true;
   if(mutation)await call.confirm('Packet Tracer: '+t.name,JSON.stringify(input));
   call.signal.throwIfAborted();ctx.emergency.assertRunning();
   if(t.name==='save_network_file'&&fs.existsSync(input.path))await ctx.backup(input.path);
   return new Promise((resolve,reject)=>{
    const child=spawn(path.join(ctx.config.stateDir,'packet-tracer-venv','Scripts','python.exe'),[path.join(ctx.projectDir,'scripts','packet-tracer-bridge.py')],{cwd:ctx.projectDir,windowsHide:true,stdio:'pipe'});
    let output='',done=false;const stop=()=>{child.kill();finish(new Error('PACKET_TRACER_CANCELLED: inspect network before retrying mutations'));};
    const timer=setTimeout(stop,Math.min(ctx.config.toolTimeoutMs,60000));
    function finish(error?:Error,value?:unknown){if(done)return;done=true;clearTimeout(timer);call.signal.removeEventListener('abort',stop);error?reject(error):resolve(value);}
    call.signal.addEventListener('abort',stop,{once:true});
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4000000)stop();});child.stderr.resume();
    child.on('error',e=>finish(e));child.on('exit',code=>{try{const result=JSON.parse(output);if(code!==0||result.error)finish(new Error(result.error??'Packet Tracer bridge failed'));else finish(undefined,result);}catch{finish(new Error('Packet Tracer bridge returned invalid response'));}});
    child.stdin.end(JSON.stringify({tool:t.name,arguments:input,approved:mutation})+'\n');
   });
  }
 }))];
}
