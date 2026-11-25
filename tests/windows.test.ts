import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { windowsTools, criticalProcesses } from '../src/windows/index.js';
import { desktopTools } from '../src/desktop/index.js';
import type { AppContext, CallContext, ToolDefinition } from '../src/server/types.js';

function fixture() {
  const calls: Array<{ operation: string; payload: Record<string, unknown> }> = [];
  const approvals: string[] = [];
  const checked: string[] = [];
  let backupCount = 0;
  const ctx = {
    config: {
      authorizedRoots: [process.cwd()],
      applications: { notepad: { executable: 'C:\\Windows\\System32\\notepad.exe', args: [], processNames: ['notepad.exe'] } },
      desktop: { enabled: true, allowedProcesses: ['notepad.exe'], presenceMaxIdleSeconds: 60 }
    },
    paths: { async check(value: string) { checked.push(value); if (value.includes('outside')) throw new Error('Access denied'); return value; }, isRoot() { return false; } },
    async backup() { backupCount++; return null; },
    async runPowerShell(operation: string, payload: Record<string, unknown>) { calls.push({ operation, payload }); return operation === 'applications' ? [{ processName: 'notepad', processId: 5 }, { processName: 'other', processId: 8 }] : { ok: true }; },
    emergency: { assertRunning() {} }
  } as unknown as AppContext;
  const call: CallContext = { signal: new AbortController().signal, async confirm(title, details) { approvals.push(`${title}\n${details}`); } };
  return { ctx, call, calls, approvals, checked, get backups() { return backupCount; } };
}
async function invoke(tool: ToolDefinition, input: Record<string, unknown>, call: CallContext) { return tool.execute(tool.schema.parse(input), call); }

test('Windows and desktop tools expose bounded strict identities and default previews', async () => {
  const f = fixture();
  const tools = [...windowsTools(f.ctx), ...desktopTools(f.ctx)];
  assert.equal(new Set(tools.map(t => t.name)).size, tools.length);
  for (const tool of tools) {
    assert.ok(tool.name.length > 0 && tool.description.length > 20);
  }
  for (const name of ['application_close', 'window_focus', 'desktop_click', 'desktop_type', 'desktop_scroll']) {
    const tool = tools.find(t => t.name === name)!;
    const result = await invoke(tool, { windowHandle: 123, processId: 5, elementId: '42.123.1', text: 'ordinary text', direction: 'down' }, f.call) as any;
    assert.equal(result.dryRun, true);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.approvals.length, 0);
  const click = tools.find(t => t.name === 'desktop_click')!;
  assert.throws(() => click.schema.parse({ windowHandle: -1, processId: 5, elementId: 'bad' }));
  assert.throws(() => click.schema.parse({ windowHandle: 1, processId: 5, elementId: '42;Stop-Process' }));
});

test('Approved window focus uses native target checks without an extra confirmation',async()=>{
 const f=fixture(),focus=windowsTools(f.ctx).find(t=>t.name==='window_focus')!;
 const result=await invoke(focus,{windowHandle:123,processId:5,dryRun:false},{...f.call,confirm:async()=>{throw new Error('Unexpected approval')}});
 assert.deepEqual(result,{ok:true});assert.equal(f.approvals.length,0);
 assert.equal(f.calls[0].operation,'focus');assert.deepEqual(f.calls[0].payload.allowedProcesses,['notepad']);
 assert.equal(f.calls[0].payload.windowHandle,123);assert.equal(f.calls[0].payload.processId,5);
});

test('Capture-only permission allows screenshot previews while desktop input remains disabled',async()=>{
  const f=fixture();f.ctx.config.desktop.enabled=false;f.ctx.config.desktop.captureEnabled=true;
  const tools=desktopTools(f.ctx),screenshot=tools.find(t=>t.name==='desktop_screenshot')!;
  const target={windowHandle:123,processId:5,path:path.resolve('workspace','capture-fixture.png')};
  assert.equal((await invoke(screenshot,target,f.call)as any).dryRun,true);assert.equal(f.calls.length,0);assert.equal(f.approvals.length,0);
  for(const name of ['desktop_click','desktop_type','desktop_scroll','desktop_inspect'])await assert.rejects(invoke(tools.find(t=>t.name===name)!,{windowHandle:123,processId:5,elementId:'42.123.1',text:'ordinary',direction:'down'},f.call),/automation is disabled/);
  await assert.rejects(invoke(screenshot,{...target,dryRun:false},{...f.call,confirm:async()=>{throw new Error('Capture declined');}}),/declined/);assert.equal(f.calls.length,0);
  await invoke(screenshot,{...target,dryRun:false},f.call);assert.equal(f.calls[0].operation,'screenshot');assert.equal(f.approvals.length,1);
  assert.deepEqual(f.calls[0].payload.allowedProcesses,['notepad']);
});

test('Explicit capture denial is independent of control and capture still requires an application allowlist',async()=>{
  const f=fixture();f.ctx.config.desktop.captureEnabled=false;const target={windowHandle:123,processId:5,path:path.resolve('workspace','capture-fixture.png')};
  await assert.rejects(invoke(desktopTools(f.ctx).find(t=>t.name==='desktop_screenshot')!,target,f.call),/capture is disabled/);
  f.ctx.config.desktop.captureEnabled=true;f.ctx.config.desktop.allowedProcesses=[];
  await assert.rejects(invoke(desktopTools(f.ctx).find(t=>t.name==='desktop_screenshot')!,target,f.call),/No desktop processes/);assert.equal(f.calls.length,0);
});

test('Application launch requires configured absolute EXE and rechecks document after confirmation', async () => {
  const f = fixture();
  const open = windowsTools(f.ctx).find(t => t.name === 'application_open')!;
  await assert.rejects(invoke(open, { appId: 'arbitrary' }, f.call), /not explicitly authorized/);
  assert.equal(f.calls.length, 0);
  const preview = await invoke(open, { appId: 'notepad', path: 'C:\\allowed\\readme.txt' }, f.call) as any;
  assert.equal(preview.dryRun, true);
  assert.deepEqual(preview.args, ['C:\\allowed\\readme.txt']);
  await invoke(open, { appId: 'notepad', path: 'C:\\allowed\\readme.txt', dryRun: false }, f.call);
  assert.equal(f.approvals.length, 1);
  assert.equal(f.calls[0].operation, 'open');
  assert.equal(f.checked.length, 3);
  assert.deepEqual(f.calls[0].payload.allowedProcesses, ['notepad']);
  f.ctx.config.applications.notepad.executable = 'notepad.exe';
  await assert.rejects(invoke(open, { appId: 'notepad' }, f.call), /absolute .exe/);
});

test('Approved automatic app launch avoids both confirmation flow and arbitrary arguments',async()=>{
  const f=fixture();f.ctx.config.applicationLaunchPolicy={automaticApproved:true,allowInstalled:false};
  const open=windowsTools(f.ctx).find(t=>t.name==='application_open')!;
  await invoke(open,{appId:'notepad',dryRun:false},f.call);assert.equal(f.approvals.length,0);assert.equal(f.calls[0].operation,'open');
  await assert.rejects(invoke(open,{appId:'unknown',dryRun:false},f.call),/not explicitly authorized/);
  f.ctx.config.applications.notepad.args=['--review-required'];await invoke(open,{appId:'notepad',dryRun:false},f.call);assert.equal(f.approvals.length,1);
});

test('Installed app discovery refuses command hosts, ambiguous names and document arguments',async()=>{
  const f=fixture();f.ctx.config.applicationLaunchPolicy={automaticApproved:true,allowInstalled:true};
  const launchCalls:string[]=[];
  f.ctx.runPowerShell=async(operation)=>{launchCalls.push(operation);if(operation==='discover-apps')return [{name:'Editor',executable:'C:\\Apps\\Editor.exe'},{name:'Bad',executable:'C:\\Windows\\PowerShell.EXE'},{name:'Duplicate',executable:'C:\\Apps\\One.exe'},{name:'Duplicate',executable:'C:\\Apps\\Two.exe'}];return{launched:true};};
  const tools=windowsTools(f.ctx),open=tools.find(t=>t.name==='application_open')!;
  const discovered=await invoke(tools.find(t=>t.name==='application_discover')!,{},f.call)as any;assert.ok(!discovered.installed.some((a:any)=>a.name==='Bad'));
  await assert.rejects(invoke(open,{appId:'Bad',dryRun:false},f.call),/missing or ambiguous/);
  await assert.rejects(invoke(open,{appId:'Duplicate',dryRun:false},f.call),/missing or ambiguous/);
  await assert.rejects(invoke(open,{appId:'Editor',path:'C:\\allowed\\evil.cmd',dryRun:false},f.call),/without a document/);
  await invoke(open,{appId:'Editor',dryRun:false},f.call);assert.equal(f.approvals.length,0);assert.equal(launchCalls.filter(x=>x==='open').length,1);
});

test('Default document opening cannot execute code/script files', async () => {
  const f = fixture();
  const open = windowsTools(f.ctx).find(t => t.name === 'application_open_file')!;
  for (const extension of ['exe', 'cmd', 'bat', 'ps1', 'lnk', 'py', 'js', 'ts']) {
    await assert.rejects(invoke(open, { path: `C:\\allowed\\test.${extension}`, dryRun: false }, f.call), /ordinary document/);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.approvals.length, 0);
  await assert.rejects(invoke(open, { path: 'C:\\outside\\test.txt' }, f.call), /Access denied/);
  await invoke(open, { path: 'C:\\allowed\\test.txt', dryRun: false }, f.call);
  assert.equal(f.calls[0].operation, 'open-file');
});

test('Graceful window closure has destructive annotation and gates bridge execution on confirmation', async () => {
  const f = fixture();
  const close = windowsTools(f.ctx).find(t => t.name === 'application_close')!;
  assert.equal(close.destructive, true);
  assert.ok(criticalProcesses.has('lsass') && criticalProcesses.has('winlogon'));
  const denied: CallContext = { ...f.call, async confirm() { throw new Error('User declined'); } };
  await assert.rejects(invoke(close, { windowHandle: 123, processId: 5, dryRun: false }, denied), /declined/);
  assert.equal(f.calls.length, 0);
  await invoke(close, { windowHandle: 123, processId: 5, dryRun: false }, f.call);
  assert.equal(f.calls[0].operation, 'close');
  assert.match(f.approvals[0], /WM_CLOSE/);
});

test('Read-only windows tools route only fixed operations and approved application status filters', async () => {
  const f = fixture();
  const tools = windowsTools(f.ctx);
  for (const [name, operation] of [['system_get_info','info'], ['system_get_drives','drives'], ['application_list','applications'], ['window_list','windows'], ['window_get_active','active']]) {
    const tool = tools.find(t => t.name === name)!;
    assert.equal(tool.readOnly, true);
    await invoke(tool, {}, f.call);
    assert.equal(f.calls.at(-1)!.operation, operation);
  }
  const status = await invoke(tools.find(t => t.name === 'application_status')!, { appId: 'notepad' }, f.call) as any;
  assert.deepEqual(status.processes, [{ processName: 'notepad', processId: 5 }]);
  assert.equal(f.approvals.length, 0);
});

test('Desktop adapter requires explicit enabling and process authorization', async () => {
  const f = fixture();
  const inspect = desktopTools(f.ctx).find(t => t.name === 'desktop_inspect')!;
  f.ctx.config.desktop.enabled = false;
  await assert.rejects(invoke(inspect, { windowHandle: 123, processId: 5 }, f.call), /disabled/);
  f.ctx.config.desktop.enabled = true;
  f.ctx.config.desktop.allowedProcesses = [];
  await assert.rejects(invoke(inspect, { windowHandle: 123, processId: 5 }, f.call), /explicitly authorized/);
  f.ctx.config.desktop.allowedProcesses = ['notepad.exe'];
  await invoke(inspect, { windowHandle: 123, processId: 5 }, f.call);
  assert.equal(f.calls[0].payload.maxElements, 250);
  assert.equal(f.calls[0].payload.presenceMaxIdleSeconds, 60);
  assert.deepEqual(f.calls[0].payload.allowedProcesses, ['notepad']);
  assert.throws(() => inspect.schema.parse({ windowHandle: 123, processId: 5, maxElements: 1001 }));
});

test('Desktop applied control actions request confirmation without echoing typed text', async () => {
  const f = fixture();
  const tools = desktopTools(f.ctx);
  for (const name of ['desktop_click', 'desktop_type', 'desktop_scroll']) {
    await invoke(tools.find(t => t.name === name)!, { windowHandle: 123, processId: 5, elementId: '42.5.9', text: 'private ordinary input', direction: 'down', dryRun: false }, f.call);
  }
  assert.deepEqual(f.calls.map(c => c.operation), ['click','type','scroll']);
  assert.equal(f.approvals.length, 3);
  assert.ok(f.approvals.every(a => !a.includes('private ordinary input')));
  const screenshot = tools.find(t => t.name === 'desktop_screenshot')!;
  await assert.rejects(invoke(screenshot, { windowHandle: 123, processId: 5, path: 'C:\\allowed\\capture.jpg' }, f.call), /PNG/);
  const preview = await invoke(screenshot, { windowHandle: 123, processId: 5, path: 'C:\\allowed\\capture.png' }, f.call) as any;
  assert.equal(preview.dryRun, true);
  await invoke(screenshot, { windowHandle: 123, processId: 5, path: 'C:\\allowed\\capture.png', dryRun: false }, f.call);
  assert.equal(f.backups, 1);
  assert.equal(f.calls.at(-1)!.operation, 'screenshot');
});

test('Windows bridge parses without executing and includes secure fail-closed restrictions', async t => {
  const bridgePath = path.resolve('scripts/windows-bridge.ps1');
  const source = await readFile(bridgePath, 'utf8');
  assert.doesNotMatch(source, /Invoke-Expression|Stop-Process|taskkill|ExecutionPolicy\s+Bypass|SendKeys|CopyFromScreen|TerminateProcess/i);
  for (const token of ['ValidateSet','IsPassword','OpenInputDesktop','GetLastInputInfo','FOFX_RECYCLEONDELETE','TSF_DELETE_RECYCLE_IF_POSSIBLE','VerifiedDestination','WM_CLOSE','PostMessage','IsOffscreen','IsEnabled','PrintWindow','MessageBoxDefaultButton]::Button2']) assert.ok(source.includes(token), token);
  if (process.platform !== 'win32') return t.skip('PowerShell syntax parser requires Windows.');
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const escapedPath = bridgePath.replaceAll("'", "''");
  const output = execFileSync(powershell, ['-NoProfile','-Command', `$tokens = $null; $issues = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${escapedPath}', [ref]$tokens, [ref]$issues); if ($issues.Count) { $issues | ForEach-Object { $_.Message }; exit 1 }; 'Syntax OK'`], { encoding: 'utf8', timeout: 20000 });
  assert.match(output, /Syntax OK/);
  const compiled = execFileSync(powershell, ['-NoProfile','-STA','-Command', `$ErrorActionPreference='Stop'; $blocks=[regex]::Matches([IO.File]::ReadAllText('${escapedPath}'), "Add-Type -TypeDefinition @'\\r?\\n([\\s\\S]*?)\\r?\\n'@"); if($blocks.Count -ne 2){throw 'Expected two native helper source blocks'}; foreach($block in $blocks){Add-Type -TypeDefinition $block.Groups[1].Value}; $sink=New-Object LaptopRecycle.RecycleOnlySink; if($sink.PreDeleteItem(0,$null) -ge 0){throw 'Permanent deletion was allowed'}; if($sink.PreDeleteItem(128,$null) -ne 0){throw 'Recycle flag rejected'}; if($sink.VerifiedDestination){throw 'Unverified result was reported'}; 'Native helper compilation and recycle-only guard OK'`], { encoding: 'utf8', timeout: 20000 });
  assert.match(compiled, /Native helper compilation and recycle-only guard OK/);
});

test('Opt-in real Windows bridge information queries', async t => {
  if (process.platform !== 'win32' || process.env.WINDOWS_LIVE_TESTS !== '1') return t.skip('Set WINDOWS_LIVE_TESTS=1 on an authorized Windows desktop after resolving script policy. No personal app/UI actions are performed.');
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  for (const [operation, payload] of [['info',{}],['drives',{}],['windows',{}],['active',{}],['applications',{kind:'running'}],['applications',{kind:'installed'}]] as const) {
    const output = execFileSync(powershell, ['-NoProfile','-STA','-File',path.resolve('scripts/windows-bridge.ps1'),'-Operation',operation,'-Payload',Buffer.from(JSON.stringify(payload)).toString('base64')], { encoding: 'utf8', timeout: 20000 });
    assert.ok(JSON.parse(output));
  }
});
