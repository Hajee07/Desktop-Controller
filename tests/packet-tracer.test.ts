import test from 'node:test';
import assert from 'node:assert/strict';
import {packetTracerTools} from '../src/windows/packet-tracer.js';
import type {AppContext} from '../src/server/types.js';

test('Packet Tracer schemas register and raw IPC remains disabled',()=>{
 const tools=packetTracerTools({projectDir:process.cwd()} as AppContext);
 assert.equal(tools.length,46);assert.equal(new Set(tools.map(t=>t.name)).size,46);
 assert.ok(!tools.some(t=>t.name==='packet_tracer_call_ipc_api'));
 const cli=tools.find(t=>t.name==='packet_tracer_send_cli_command')!;
 assert.throws(()=>cli.schema.parse({}));
 const open=tools.find(t=>t.name==='packet_tracer_open_device_cli')!;
 assert.equal((open.schema.parse({name:'PUBLIC-DNS',terminal:'Desktop',processId:1,windowHandle:1}) as any).terminal,'Desktop');
 assert.equal((open.schema.parse({name:'ISP-SW',processId:1,windowHandle:1}) as any).terminal,'CLI');
 assert.throws(()=>open.schema.parse({name:'x',terminal:'PowerShell',processId:1,windowHandle:1}));
});
test('Packet Tracer destructive mutation cannot run after approval denial',async()=>{
 const ctx={projectDir:process.cwd(),paths:{check:async()=>{throw Error('outside authorized roots')}},emergency:{assertRunning(){}}} as unknown as AppContext;
 const tools=packetTracerTools(ctx);
 const clear=tools.find(t=>t.name==='packet_tracer_create_new_network')!;
 await assert.rejects(clear.execute(clear.schema.parse({}),{signal:new AbortController().signal,confirm:async()=>{throw Error('Approval denied')}}),/Approval denied/);
 const save=tools.find(t=>t.name==='packet_tracer_save_network_file')!;
 await assert.rejects(save.execute({path:'C:\\outside\\lab.pkt'},{signal:new AbortController().signal,confirm:async()=>{throw Error('Must not prompt')}}),/outside authorized roots/);
});
