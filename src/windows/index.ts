import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import {documentExtensions} from '../filesystem/documents.js';
import {createHash} from 'node:crypto';
import type { AppContext, ToolDefinition, CallContext } from '../server/types.js';

const dryRun = z.boolean().default(true);
const target = { windowHandle: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), processId: z.number().int().positive() };
const restrictedLauncher=/^(?:cmd|powershell|pwsh|node|python[\d.]*|pythonw[\d.]*|py|java|javaw|cscript|wscript|mshta|rundll32|regsvr32|msiexec|winget|reg|sc|schtasks|setup|install|uninstall|update|updater|sdxhelper|msoadfsb|msoasb|shellmcpservers\.packaging|windowspackagemanagerserver)$/i;
async function discovered(ctx:AppContext,call:CallContext){
  const raw=await ctx.runPowerShell('discover-apps',{},call.signal);const rows=Array.isArray(raw)?raw:raw?[raw]:[];
  return rows.filter((r:any)=>typeof r.name==='string'&&typeof r.executable==='string'&&path.isAbsolute(r.executable)&&/\.exe$/i.test(r.executable)&&!restrictedLauncher.test(path.parse(r.executable).name)&&!criticalProcesses.has(path.parse(r.executable).name.toLowerCase())).map((r:any)=>({appId:'installed:'+createHash('sha256').update(r.executable.toLowerCase()).digest('hex').slice(0,20),name:r.name,executable:r.executable}));
}
export const criticalProcesses = new Set(['system', 'idle', 'registry', 'smss', 'csrss', 'wininit', 'services', 'lsass', 'winlogon', 'svchost', 'dwm', 'sihost', 'fontdrvhost', 'securityhealthservice', 'msmpeng', 'codex', 'node', 'powershell', 'pwsh']);
export function approvedProcesses(ctx: AppContext): string[] {
  return [...new Set(Object.values(ctx.config.applications).flatMap(app => app.processNames).map(n => n.replace(/\.exe$/i, '').toLowerCase()))];
}
function guardApp(ctx: AppContext, appId: string) {
  const app = Object.hasOwn(ctx.config.applications,appId)?ctx.config.applications[appId]:undefined;
  if (!app) throw new Error('Application is not explicitly authorized. Add it using the local configuration process.');
  if (!path.isAbsolute(app.executable) || path.extname(app.executable).toLowerCase() !== '.exe') throw new Error('Approved applications must use absolute .exe paths.');
  return app;
}
function environment(ctx: AppContext) {
  return { allowedProcesses: approvedProcesses(ctx), presenceMaxIdleSeconds: ctx.config.desktop.presenceMaxIdleSeconds };
}
async function action(ctx: AppContext, call: CallContext, operation: string, payload: Record<string, unknown>, input: { dryRun: boolean }, details: string) {
  if (input.dryRun) return { dryRun: true, operation, details, target: payload };
  await call.confirm(`Windows Laptop Control: ${operation}`, details);
  ctx.emergency.assertRunning();
  return ctx.runPowerShell(operation, { ...environment(ctx), ...payload }, call.signal);
}

export function windowsTools(ctx: AppContext): ToolDefinition[] {
  return [
    {name:'application_discover',description:'List installed launchable GUI applications from Windows App Paths and Start Menu executable shortcuts. No arbitrary arguments or installer/script execution.',schema:z.object({}).strict(),readOnly:true,async execute(_,call){return {configured:Object.keys(ctx.config.applications),installed:await discovered(ctx,call),policy:ctx.config.applicationLaunchPolicy??{automaticApproved:false,allowInstalled:false}};}},
    { name: 'system_get_info', description: 'Read basic Windows/Node system information; does not collect credentials or environment variables.', schema: z.object({}), readOnly: true,
      async execute(_, call) { return ctx.runPowerShell('info', {}, call.signal); } },
    { name: 'system_get_drives', description: 'List local filesystem drive capacity and the authorized directory roots.', schema: z.object({}), readOnly: true,
      async execute(_, call) { return { drives: await ctx.runPowerShell('drives', {}, call.signal), authorizedRoots: ctx.config.authorizedRoots }; } },
    { name: 'application_list', description: 'List running application/process names and IDs or installed application names without command-line/credential collection.', schema: z.object({ kind: z.enum(['running', 'installed']).default('running') }), readOnly: true,
      async execute(input, call) { return ctx.runPowerShell('applications', { kind: input.kind }, call.signal); } },
    { name: 'application_open', description: 'Launch configured or policy-authorized installed GUI apps by exact appId/name. Approved zero-argument launches can be automatic. Discover apps first; document paths are supported only for configured integrations.', schema: z.object({ appId: z.string().min(1).max(100), path: z.string().max(32760).optional(), dryRun }), readOnly: false,
      async execute(input, call) {
        let app;let installed=false;
        if(Object.hasOwn(ctx.config.applications,input.appId))app=guardApp(ctx,input.appId);
        else {
          if(!ctx.config.applicationLaunchPolicy?.allowInstalled)throw new Error('Application is not explicitly authorized. Add it using the local configuration process.');
          const matches=(await discovered(ctx,call)).filter((r:any)=>r.appId===input.appId||r.name.toLowerCase()===input.appId.toLowerCase());
          const unique=[...new Map(matches.map((r:any)=>[r.executable.toLowerCase(),r])).values()];
          if(unique.length!==1)throw new Error('Application name is missing or ambiguous. Use application_discover and its exact appId.');
          const found=unique[0] as any;app={executable:found.executable,args:[],processNames:[path.parse(found.executable).name]};installed=true;
          if(input.path)throw new Error('Launch discovered apps without a document argument. Configure a reviewed application integration to open project/document paths.');
        }
        const documentPath = input.path ? await ctx.paths.check(input.path) : undefined;
        if (input.appId === 'spss' && documentPath && (!/\.(?:sav|zsav|spv)$/i.test(documentPath) || !(await fs.stat(documentPath)).isFile())) {
          throw new Error('SPSS launch accepts only authorized SAV, ZSAV, or SPV files.');
        }
        const payload = { executable: app.executable, args: [...app.args, ...(documentPath ? [documentPath] : [])] };
        if (input.dryRun) return { dryRun: true, operation: 'open', ...payload };
        let automatic=ctx.config.applicationLaunchPolicy?.automaticApproved&&app.args.length===0&&!restrictedLauncher.test(path.parse(app.executable).name)&&!criticalProcesses.has(path.parse(app.executable).name.toLowerCase());
        if(automatic&&documentPath){const ordinary=(await fs.stat(documentPath)).isDirectory()||documentExtensions.has(path.extname(documentPath).toLowerCase())||/\.(png|jpe?g|gif|bmp)$/i.test(documentPath);if(!ordinary)automatic=false;}
        if(!automatic)await call.confirm('Open approved application', `${app.executable}\nArguments: ${JSON.stringify(payload.args)}`);
        if(installed&&!(await discovered(ctx,call)).some((r:any)=>r.executable.toLowerCase()===app.executable.toLowerCase()))throw new Error('Installed application registration changed; discover again.');
        if (input.path) await ctx.paths.check(input.path);
        ctx.emergency.assertRunning();
        return ctx.runPowerShell('open', { ...environment(ctx), ...payload }, call.signal);
      } },
    { name: 'application_open_file', description: 'Open an authorized ordinary document with its default Windows application after a preview and confirmation. Executable/script/shortcut files are prohibited.', schema: z.object({ path: z.string().min(1), dryRun }), readOnly: false, openWorld: true,
      async execute(input, call) {
        const checked = await ctx.paths.check(input.path);
        if (!/\.(txt|md|json|csv|pdf|docx|xlsx|pptx|png|jpg|jpeg|gif|bmp|html|css)$/i.test(checked)) throw new Error('Only supported ordinary document formats may be opened. Use an approved editor for script/code files.');
        if (input.dryRun) return { dryRun: true, operation: 'open-file', path: checked };
        await call.confirm('Open document with its default application', checked);
        const current = await ctx.paths.check(input.path);
        ctx.emergency.assertRunning();
        return ctx.runPowerShell('open-file', { ...environment(ctx), path: current }, call.signal);
      } },
    { name: 'application_close', description: 'Request graceful closure of one approved application window with confirmation. Windows retains its own unsaved-work prompts; processes are never forcibly terminated.', schema: z.object({ ...target, dryRun }), readOnly: false, destructive: true,
      async execute(input, call) { return action(ctx, call, 'close', targetPayload(input), input, `Send WM_CLOSE to window ${input.windowHandle}, process ${input.processId}. Unsaved-work dialogs must be handled by the user.`); } },
    { name: 'window_list', description: 'List visible top-level Windows application windows and stable handle/process identifiers.', schema: z.object({}), readOnly: true,
      async execute(_, call) { return ctx.runPowerShell('windows', {}, call.signal); } },
    { name: 'window_get_active', description: 'Identify the current foreground window without reading field values.', schema: z.object({}), readOnly: true,
      async execute(_, call) { return ctx.runPowerShell('active', {}, call.signal); } },
    { name: 'window_focus', description: 'Preview or focus one visible approved application window while the user is present and the desktop is unlocked. Approved window focus runs under the existing local app policy without a separate confirmation.', schema: z.object({ ...target, dryRun }), readOnly: false,
      async execute(input, call) {
        if(input.dryRun)return {dryRun:true,operation:'focus',target:targetPayload(input)};
        ctx.emergency.assertRunning();
        return ctx.runPowerShell('focus',{...environment(ctx),...targetPayload(input)},call.signal);
      } },
    { name: 'application_status', description: 'Read status of an explicitly approved running application without collecting its command line.', schema: z.object({ appId: z.string().min(1).max(100) }), readOnly: true,
      async execute(input, call) {
        const app = guardApp(ctx, input.appId);
        const all = await ctx.runPowerShell('applications', { kind: 'running' }, call.signal);
        return { appId: input.appId, processes: (Array.isArray(all) ? all : [all]).filter((p: any) => app.processNames.some(n => n.replace(/\.exe$/i, '').toLowerCase() === String(p.processName).toLowerCase())) };
      } }
  ];
}
function targetPayload(input: { windowHandle: number; processId: number }) { return { windowHandle: input.windowHandle, processId: input.processId }; }
