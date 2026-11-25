# Packet Tracer verification, 2026-11-25

## Latest adapter deployment

All changes compiled into dist. There are 46 Packet Tracer tools (45 native IPC
wrappers plus the device window/terminal adapter). PacketTracer is configured as
an approved application/capture process. Reconnect the existing MCP server to
load its new tool registry and config; no replacement server registration needed.

`packet_tracer_open_device_cli` accepts terminal=CLI or terminal=Desktop.
Desktop selects the native CommandPromptBtn by automation ID, not its multiline
label. Occluded device-list rows are reached by scoped child-window messages
within the verified PacketTracer process. No foreground activation, cursor
movement or Computer Use plugin is required. Visible row bounds are checked
because Qt can report offscreen rows as visible.

Actual PUBLIC-DNS Desktop Command Prompt opened successfully, ipconfig completed,
and workspace/PUBLIC-DNS-desktop-ipconfig.png was visually inspected: command,
IPv4 203.0.113.53, mask 255.255.255.0 and gateway 203.0.113.1 are visible.

## Passed

- TypeScript compile and type check.
- Upstream fake-PTMP fixture suite: 32 passed, 1 skipped. Covers topology,
  configuration, links, modules, simulation, file operations and error handling
  against a simulated server, not the installed Packet Tracer.
- Wrapper/Windows checks: 15 passed, 1 opt-in live Windows test skipped.
  Schema discovery, raw IPC exclusion, approval denial, path restrictions,
  window/control guards and approved process routing passed.
- Live Packet Tracer 8.2.2: all 11 read/CLI checks passed. Environment,
  devices, interfaces, actual configuration, console log, visible show clock,
  engine show ip interface brief, cable endpoints, models, annotations and
  final network counts were checked. Report: test-results/packet-tracer-live-report.json.
- Prior actual acceptance in this session: ISP-SW accessibility window opening,
  CLI selection and background screenshot; actual show clock text visibly
  verified in workspace/ISP-SW-show-clock-verified.png.
- Independent bridge invocations authenticated and reconnected successfully.

## Fixes found during testing

- Test parser now accepts plain-text console logs as well as JSON output.
- Packet Tracer 8.2 returns Antenna objects in network links. Cable enumeration
  excludes those objects before Cable-only API calls. Tool description explicitly
  states this limitation; cable count must not be presented as all radio links.

## Not yet live verified

Topology creation/deletion, interface/configuration writes, module changes,
save/reopen, simulation changes and end-to-end ping in a generated lab.
The installed app's current 294-device/523-link personal lab was left intact.
The upstream live tests explicitly require an empty/scratch file. They were not
run against the personal lab. To finish live mutation acceptance, use a separate
empty Packet Tracer instance or a scratch network after preserving the current
unsaved lab. No fixture/mock success proves these live capabilities.

No personal lab file was saved, overwritten, closed or replaced during this run.
Live counts before and after: 294 devices and 523 links.
