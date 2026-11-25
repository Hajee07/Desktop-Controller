import {reserveOutput} from '../storage/index.js';
import { z } from 'zod';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { AppContext, ToolDefinition, CallContext } from '../server/types.js';

const target = { windowHandle: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), processId: z.number().int().positive() };
const elementId = z.string().regex(/^-?\d+(?:\.-?\d+){1,30}$/).max(512);
const dryRun = z.boolean().default(true);
export function desktopPayload(ctx: AppContext, input: Record<string, unknown>,capability:'control'|'capture'='control') {
  const enabled=capability==='capture'?(ctx.config.desktop.captureEnabled??ctx.config.desktop.enabled):ctx.config.desktop.enabled;
  if (!enabled) throw new Error(capability==='capture'?'Desktop capture is disabled. Enable desktop.captureEnabled using the local configuration process.':'Desktop automation is disabled. Enable it using the local configuration process.');
  if (!ctx.config.desktop.allowedProcesses.length) throw new Error('No desktop processes have been explicitly authorized.');
  return { ...input, allowedProcesses: ctx.config.desktop.allowedProcesses.map(p => p.replace(/\.exe$/i, '').toLowerCase()), presenceMaxIdleSeconds: ctx.config.desktop.presenceMaxIdleSeconds };
}
async function perform(ctx: AppContext, call: CallContext, operation: string, input: Record<string, any>, details: string) {
  const payload = desktopPayload(ctx, input);
  if (input.dryRun) return { dryRun: true, operation, target: { windowHandle: input.windowHandle, processId: input.processId, elementId: input.elementId }, details };
  await call.confirm(`Desktop ${operation}`, details);
  ctx.emergency.assertRunning();
  return ctx.runPowerShell(operation, payload, call.signal);
}
export function desktopTools(ctx: AppContext): ToolDefinition[] {
  return [
    { name: 'desktop_inspect', description: 'Read bounded visible UI Automation elements of one approved window. Secure/password elements and values are omitted; requires an unlocked desktop and recent user activity.', schema: z.object({ ...target, maxElements: z.number().int().min(1).max(1000).default(250) }), readOnly: true,
      async execute(input, call) { return ctx.runPowerShell('inspect', desktopPayload(ctx, input), call.signal); } },
    { name: 'desktop_click', description: 'Preview or invoke/select/toggle one visible accessible control from desktop_inspect. No raw coordinate input; secure fields are blocked. Every applied action requires confirmation.', schema: z.object({ ...target, elementId, action: z.enum(['invoke', 'select', 'toggle', 'expand', 'collapse']).default('invoke'), dryRun }), readOnly: false, destructive: true, openWorld: true,
      async execute(input, call) { return perform(ctx, call, 'click', input, `${input.action} accessible control ${input.elementId} in window ${input.windowHandle}, process ${input.processId}. This may change application or external account state.`); } },
    { name: 'desktop_type', description: 'Preview or replace ordinary text in one visible approved writable UI Automation ValuePattern field. Password/credential fields are blocked; no global keystrokes or Enter submission.', schema: z.object({ ...target, elementId, text: z.string().max(100000), dryRun }), readOnly: false, destructive: true,
      async execute(input, call) { return perform(ctx, call, 'type', input, `Replace ordinary text in control ${input.elementId}, window ${input.windowHandle}, process ${input.processId}. Text length: ${input.text.length}. The text is intentionally excluded from this summary and audit logs.`); } },
    { name: 'desktop_scroll', description: 'Preview or scroll a visible UI Automation scroll container in an approved window without synthetic mouse or keyboard input.', schema: z.object({ ...target, elementId, direction: z.enum(['up', 'down', 'left', 'right']), amount: z.enum(['small', 'large']).default('large'), dryRun }), readOnly: false,
      async execute(input, call) { return perform(ctx, call, 'scroll', input, `Scroll ${input.direction} by a ${input.amount} increment in control ${input.elementId}, window ${input.windowHandle}.`); } },
    { name: 'desktop_screenshot', description: 'Preview or capture only one approved foreground application window to an authorized PNG. Capture is denied when any password/credential field is present or secure-field inspection is incomplete.', schema: z.object({ ...target, path: z.string().min(1), dryRun }), readOnly: false,
      async execute(input, call) {
        desktopPayload(ctx, input,'capture');
        const output = await ctx.paths.check(input.path, 'write');
        if (path.extname(output).toLowerCase() !== '.png') throw new Error('Screenshot output must be a PNG file.');
        const exists = await stat(output).then(() => true, () => false);
        if (input.dryRun) return { dryRun: true, operation: 'screenshot', path: output, overwrites: exists, windowHandle: input.windowHandle };
        await call.confirm('Capture approved application window', `Capture window ${input.windowHandle}, process ${input.processId} to ${output}.${exists ? ' An existing file will be backed up.' : ''} Capture excludes other windows and refuses visible secure fields.`);
        const current = await ctx.paths.check(input.path, 'write');
        await ctx.backup(current);
        ctx.emergency.assertRunning();
        const release=await reserveOutput(ctx,current,160*1024*1024,call.signal);try{return await ctx.runPowerShell('screenshot', desktopPayload(ctx, { ...input, path: current },'capture'), call.signal);}finally{release();}
      } }
  ];
}
