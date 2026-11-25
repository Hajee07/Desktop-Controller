import { z } from 'zod';
import type { AppContext, ToolDefinition, CallContext } from '../server/types.js';
export function commandPreview(ctx:AppContext,id:string,cwd:string){
  const cmd=Object.hasOwn(ctx.config.commands,id)?ctx.config.commands[id]:undefined;if(!cmd)throw new Error('COMMAND_DENIED: choose a configured command ID');
  return {commandId:id,executable:cmd.executable,args:cmd.args,cwd,effects:cmd.description,networkRequested:cmd.allowNetwork,requiresConfirmation:cmd.requiresConfirmation};
}
export async function executeCommand(ctx:AppContext,id:string,cwd:string,dryRun:boolean,call:CallContext){
  const folder=await ctx.paths.check(cwd,'read');const preview=commandPreview(ctx,id,folder);
  if(dryRun)return {dryRun:true,...preview};
  const safeVersion=preview.executable.toLowerCase()===process.execPath.toLowerCase()&&JSON.stringify(preview.args)==='["--version"]';
  if(preview.requiresConfirmation||!safeVersion)await call.confirm('Execute approved local command',JSON.stringify(preview,null,2));
  call.signal.throwIfAborted();ctx.emergency.assertRunning();await ctx.paths.check(folder,'read');
  return {dryRun:false,...await ctx.runProcess(preview.executable,preview.args,{cwd:folder,signal:call.signal,timeoutMs:ctx.config.toolTimeoutMs,allowNetwork:preview.networkRequested})};
}
export function powershellTools(ctx:AppContext):ToolDefinition[]{
  const schema=z.object({commandId:z.string().min(1).max(64),cwd:z.string().min(1),dryRun:z.boolean().default(true)}).strict();
  return [
    {name:'powershell_preview',description:'Preview one locally configured fixed command. No raw shell or arbitrary PowerShell input is accepted.',schema:schema.omit({dryRun:true}),readOnly:true,async execute(i){return commandPreview(ctx,i.commandId,await ctx.paths.check(i.cwd));}},
    {name:'powershell_execute_approved',description:'Run a fixed allowlisted executable and argv in an authorized folder; default is preview. High-impact commands require host and local confirmation.',schema,readOnly:false,destructive:true,async execute(i,c){return executeCommand(ctx,i.commandId,i.cwd,i.dryRun,c);}}
  ];
}
