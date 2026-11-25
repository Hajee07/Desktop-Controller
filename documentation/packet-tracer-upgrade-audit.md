# Packet Tracer integration audit

Inspected 2026-11-25. Existing Hajzyy MCP retained. Uploaded archive extracted
under integrations/pt-mcp-server-main with upstream license notices preserved.
No upstream setup scripts executed and no external registration changed.

## Verified local prerequisites

- Packet Tracer installed: C:\Program Files\Cisco Packet Tracer 8.2.2.
- Executable: bin/PacketTracer.exe; native ExApp builder: bin/meta.exe.
- No running PacketTracer process observed during audit.
- Upstream requires Python 3.12-3.14 and fastmcp, pydantic-settings, uvicorn.
  These dependencies are absent from the configured Python environment.
- No upstream per-user pt-mcp.env or PTMCP.pta registration artifact found.

## Reusable upstream functionality

45 default tools cover topology creation/export, devices, cabling, IOS CLI,
PC/server terminal commands, host addressing, configuration retrieval/save,
modules, simulation events/PDU inspection, annotations and network file I/O.
The optional raw IPC tool must remain disabled initially.
Upstream tests primarily target Packet Tracer 9.0.1; bundled 8.2.0 API data is
not proof of compatibility with the installed 8.2.2 application.

## Required integration changes

1. Isolated project-local Python environment; install reviewed dependencies only
   after user approval. Do not modify the shared Python environment.
2. Proxy native operations through the existing MCP registry, retaining native
   schemas, bounded outputs, serial IPC execution and emergency-stop handling.
3. Override upstream elicit_confirmation: it currently always returns true.
   Gate destructive operations through Hajzyy's host/local approval flow.
4. Validate file paths against AuthorizedPaths before open/save. Preserve backups
   before overwrite; never expose upstream unrestricted fileSaveAsNoPrompt.
5. Build project-local ExApp artifacts using Cisco meta.exe and a private random
   key kept in protected state. Register the .pta via Packet Tracer's supported
   Extensions > IPC > Configure Apps interface. Keep IPC on loopback.
6. Add PacketTracer to the reviewed application/capture allowlists and reuse
   actual-window screenshot tools; never render synthetic topology as evidence.
7. Run upstream fixture tests separately from live acceptance. Test generated labs:
   two hosts/switch/router, address configuration, show commands, connectivity,
   save/reopen and real application screenshot. Do not overwrite existing labs.

## Status

Audit and source import complete. Dependency installation, bridge implementation,
ExApp registration, version verification and live tests remain pending.
## Implementation update

Project-local dependencies installed in `.state/packet-tracer-venv` (pip check
passed). `scripts/packet-tracer-bridge.py` routes upstream tools through an
in-memory MCP client and local native IPC. `src/windows/packet-tracer.ts`
registers 45 prefixed tools with Zod schemas derived from upstream JSON schemas.
Raw/unverified IPC disabled; loopback enforced. Mutations require host/local
approval. PKT/PKA open/save paths require existing path policy; overwrite backup
retained. Each call uses a bounded child process, not a persistent IPC session.
Screenshot capture reuses existing tools with PacketTracer process authorized.

TypeScript build passed; upstream fixture tests 32 passed / 1 skipped; wrapper
schema/denial/path tests 2 passed. These are not live topology acceptance.

`scripts/packet-tracer-prepare.py` generated `.state/packet-tracer/HajzyyMCP.pta`
using installed Cisco meta.exe, reporting version 8.2.2.0400. Private credentials
stay in protected state. No Packet Tracer setting was automatically modified.

Actual get_pt_information reached an IPC endpoint but authentication was rejected.
Required manual setup: Packet Tracer > Extensions > IPC > Configure Apps > Add
the generated HajzyyMCP.pta, approve it, leave On Demand enabled. Reconnect Hajzyy
MCP to discover the new tools. Then run get_pt_information and generated-lab
acceptance before claiming live design/configuration/screenshots successful.

Native GUI probe: 2026-11-25, ISP-SW getDialogManager/getDialog(name) failed with 'DeviceDialog: IPC Cache entry:'. No topology mutation was requested. Installed 8.2 API contains visibility methods on cached dialogs but no discovered open-device/create-dialog or select-CLI-tab method. Experimental bridge branch removed; no working open-CLI tool claimed. Native show running-config previously passed. Genuine CLI screenshots still require a visible CLI window or a separately authorized accessibility integration.

Accessibility adapter update: packet_tracer_open_device_cli registered (46 tools total). UIAutomation grid lookup, clipped-row bounds check, bounded scrolling and scoped Win32 messages open the exact device without moving the cursor. CLI tab Invoke and visible command control verified on ISP-SW (PID 4004, handle 2819958). Initial probe opened INTERNET due an obscured row; closed that probe dialog without edits and fixed viewport validation. TypeScript build and wrapper tests pass. Actual screenshot attempt was denied by RECENT_USER_PRESENCE_REQUIRED; no screenshot delivered. Existing desktop presence/secure-field checks retained. Reconnect needed for new tool discovery.

Visible-console fix verified: CiscoDevice.enterCommand (send_cli_command) returns engine output without updating the GUI. send_terminal_command uses getCommandLine().enterCommand and outputWritten events. Actual ISP-SW show clock returned completed=true/status=ok and its command/output were visually verified in workspace/ISP-SW-show-clock-verified.png. Tool descriptions now route screenshot tasks through visible terminal execution. No configuration changes were made.
