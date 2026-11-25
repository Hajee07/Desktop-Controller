# Codex Controlled Academic Execution Upgrade

## Audit and architecture

The input repository was version 1.2 with 116 tools after local fixes. It already provided authorized paths, streaming files, a 2 GiB file ceiling, 2.5-million-character extraction, safe Office ZIP/XML inspection, FTS5/corpus LSA, academic plans/checkpoints/reasoning packets, document generation, isolated Playwright, SQL/command allowlists, audit metadata and emergency stop.

Missing foundations were live Office tools, workspace quotas, deterministic background coordination, non-focusing window evidence, a dashboard and resource reporting. Source was backed up under `backups/before-ultimate-v3-*` before structural edits. Native Office code was adapted from the existing project backup. No new AI model/provider/agent or npm/Python dependency was installed.

Execution: Codex reasoning/review → official MCP v2 STDIO registry → two independent read slots / serialized mutations → storage reservations → filesystem, Playwright or a lazy session-owned native .NET STA worker. Academic plans and deterministic jobs use separate persistent SQLite stores. No internet server or automatically installed startup service is present.

New source: `src/storage`, `src/office`, `src/runtime`, `src/documents`, `src/windows/native`, `src/desktop/media.ts`, `src/filesystem/chunks.ts`, `src/development/editor.ts`. Existing tools remain. Duplicate names fail registration. SDK progress notifications are sent when requested by a client progress token.

## Word and Office

Word attaches existing ROT sessions and returns explicit document IDs/paths, active IDs, revisions, paginated paragraphs, exact headings/ranges, tables and selection. `word_edit_batch` accepts prepared text/style/format/image/table/cell/header/footer/page-number/TOC/Track Changes operations, creates an unsaved-content checkpoint and groups Undo. `word_save_document` and `word_export_pdf` are explicit. Checkpoint creation, hash-verified protected restore, last-transaction Undo and transaction inspection are separate tools. Request keys bind exact input to prevent duplicate/changed replay.

Word revision hashing covers normalized XML including evidence; volatile session identifiers are ignored. Word serialization still consumes RAM and is capped at 384 Mi XML characters. Word's own changes can make a range/revision stale: re-inspect before another edit, and never retry uncertain mutations blindly. Existing Word content and formatting are retained by native range operations; unrelated original files were not used for acceptance tests.

Excel exposes worksheet names, values/formulas/number formats, native value/formula batches, formatting, tables, charts, save and PDF export. Reads are limited to 1000 cells and formulas to supported non-external functions. Its revision covers the inspected range, not the entire workbook.

PowerPoint exposes stable slide/shape IDs, text/geometry/notes revisions, text editing, layout-reusing slide additions, images, speaker notes, bounded tables, save and PDF export. Native chart-data editing is not included. Rich new decks remain available through direct presentation generation. Multiple separate PowerPoint processes are rejected as ambiguous.

`*_open` accepts ordinary saved Office formats, disables macros and rejects embedded active objects, unsafe fields and external data/template relationships. Read/discovery does not start Office; explicit open calls may do so. Helpers do not close user applications. Original document edits/saves outside project `workspace` keep host plus local confirmation. Working-copy edits use the configured persistent trust policy. Offline Office overwrites refuse owner locks.

## Screenshot evidence

The existing foreground screenshot tool is preserved. `screenshot_capture` adds selected/active window, monitor and region capture. Window mode uses actual PrintWindow content without changing focus. Full-screen/region modes always ask, inspect intersecting windows and can conservatively refuse unapproved/system windows. Secure/password/payment controls, unavailable accessibility trees, oversized captures, locked desktops and missing recent physical presence are refused. GPU/DRM applications may not support PrintWindow.

`image_transform` creates explicitly derived crop/resize PNGs with source/output hashes. `image_preview` forwards bounded genuine files. Codex supplies captions when required; images are never fabricated as software evidence. App launch permission does not automatically grant screenshot/UI control permission.

## Deterministic background tasks

The queue persists requests, ordered prepared steps, priorities, cursor/results, state, owner lease and interruptions in `.state/execution-queue.sqlite`. Supported states include QUEUED, RUNNING, WAITING_FOR_CODEX, WAITING_FOR_USER, PAUSED, COMPLETED, FAILED and CANCELLED. Planning/reasoning remains in Codex and existing academic tools.

One active deterministic step is shared across coordinators. Pause applies after the current step; cancellation is polled across processes. Expired leases become WAITING_FOR_USER. Completed steps are not repeated. An uncertain/failed operation requires an explicit effects-reviewed resolution. A reasoning step stops as WAITING_FOR_CODEX. Job completion means its finite tools succeeded, not that academic content is correct.

`npm run worker` is a separate opt-in visible terminal process. It can continue prepared deterministic work after an MCP client disconnects; it cannot generate answers or invoke a second AI provider. Ctrl+C stops it. Closing the MCP session stops that session's own helpers. No Windows startup registration was added.

## Storage and resources

The maximum managed quota is exactly **20,000,000,000 bytes (20 GB)**. Decimal category defaults: documents 5 GB, images 5 GB, research 3 GB, temporary 3 GB, history 1 GB, reserved 3 GB. Current free-space reserve is 5 GiB. Authorized roots and protected server state count; originals are never automatically deleted. Backups/browser binaries/database backups are reserved; browser profiles and `.state/temp` are temporary.

SQLite reservations coordinate managed writes/checkpoints across server processes. Large file hashes/copies/comparisons/backups/restores are streamed or disk-based. `filesystem_read_chunk` returns bounded byte pages and continuation offsets. Binary parsing uses a separate 256 MiB RAM bound. Office package allowance is 2 GiB, XML 40 MiB, total extracted text 2.5 million code units. Per-segment/page/cell/image limits remain.

Only expired direct ordinary files in protected `.state/temp` can be removed automatically after 24 hours. Sources, backups and task history are retained. Duplicate detection reports matching hashes without deleting data. External programs/user actions can change disk use independently: this is application-level reservation protection, not an NTFS hard quota or OS sandbox. Native applications/approved code can create files outside a managed operation.

Helpers start lazily; Office runs in STA, mutations are serialized, and two independent read requests may run concurrently. No GPU workload, LLM service, keystroke recording or hidden desktop polling was introduced. Resource tools return process/host memory and CPU metadata. Dashboard resource snapshots describe their short-lived snapshot worker rather than the long-running MCP process.

## Dashboard and setup

The WinForms dashboard has Dashboard, Active Tasks, Assignment Workspace, File Manager, Screenshot Manager, MCP Tools, Task History, Storage Monitor, Resource Monitor, Permissions and Settings views. It shows structured local state and task-ID pause/resume/cancel/Stop controls, opens the workspace, and has a floating state panel. PySide6 was absent and was not installed. The floating panel shows the selected active task description, state, progress, operation and errors with pause/resume/cancel/Stop and workspace opening. It is an execution inspector, not a full file-management GUI.

```powershell
Set-Location -LiteralPath 'C:\Users\Hajzzy\Documents\ChatGPT\Hajzzy!!-MCP 2\windows-laptop-control-mcp'
npm run build
npm run test:smoke
npm run dashboard
# Optional visible prepared-task worker:
npm run worker
```

Existing Codex registration still uses the installed Node executable with this project's absolute `dist/index.js` and project cwd, startup timeout 30 seconds and tool timeout 120 seconds. Server operation timeout remains configured at 90 seconds. Reconnect MCP or quit/reopen Codex after updating; opening another chat can retain an old process/catalog. Scoped tool policies reduce routine host prompts while protected internal approvals remain.

`scripts/start.ps1`, `-Dashboard`, `-Worker` and `scripts/setup.ps1` provide Windows entrypoints. Setup verifies existing dependencies; its install switch asks before installing Node dependencies into this project. No installation was performed during this upgrade. On another machine, review and replace actual roots/app/Python paths in the example, build and run registration preview before explicit apply. Existing configs and other MCP servers are backed up/preserved.

Official references: [Codex STDIO configuration](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers), [MCP SDK progress/cancellation](https://ts.sdk.modelcontextprotocol.io/v2/servers/logging-progress-cancellation).

## Actual verification

`ULTIMATE-ACCEPTANCE.json`: sample instructions/lecture text, DOCX generation, native section insertion, actual Word window capture, evidence insertion, same-document save, PDF export, structural quality, stale-edit rejection, Excel SUM result 30, PowerPoint second slide, PDF split/merge and queued calculation 5. The exported PDF was rendered and its page inspected. Prepared answers are scripted theoretical fixtures, not autonomous AI output or experimental evidence.

`ULTIMATE-ADVANCED-VERIFICATION.json`: actual Word table cell 42, header/footer/page-number edit/save/export and derived crop. `ULTIMATE-OFFICE-EXTRAS.json`: actual Excel formatting/table/chart and PowerPoint notes/table/image operations. `ULTIMATE-CODING-VERIFICATION.json`: actual JavaScript/Python/Java execution with output 5 and unchanged sources. The coding library fixture has a test confirmation callback; production host/local dialogs remain enforced. `DASHBOARD-VERIFICATION.json`: actual final visible dashboard capture inspected. `ULTIMATE-RECOVERY-VERIFICATION.json`: actual native Undo, hash-bound checkpoint restore and retained single Word document after helper reconnect. A newly opened Word fixture required one safe read-only checkpoint reinspection; no uncertain edits were replayed. Protected Undo/restore used a fixture approval callback, not a production dialog test. `ULTIMATE-OFFICE-EXPORTS.json`: actual workbook/presentation properties and native PDF exports.

The final full regression passed 145 of 148 with zero failures and three skips: two owned-render tests protect already running Word, and one file-symlink test requires unavailable Windows privilege. Junction/hardlink/path checks still execute. Native live Word acceptance executed separately. Fresh STDIO discovery returns 163 tools and rejects 132 invalid required-input schemas. The separate academic STDIO smoke generates all four formats, preserves sources and correctly refuses finalization without layout/technical review. Current counts/catalog/resources are recorded in `ULTIMATE-FINAL-VERIFICATION.json`.

## Remaining limits and recovery

There is no universal private-state control for every installed app, personal-browser takeover, new OS code sandbox, installed C/C++ compiler integration, native PowerPoint chart-data adapter, or automatic academic correctness certification. Page layout, images/references and conclusions require Codex/user review. Screenshot variants and advanced Office operations not individually exercised must not be called tested just because a schema exists. External submissions/uploads/messages require explicit authorization.

Inspect `word_get_document_changes`, checkpoints and fresh properties before retrying uncertain edits. Never run competing DOCX writers while native Word owns the document. Histories survive reconnect. Emergency stop persists until `npm run configure -- --resume` is explicitly run locally. It cancels managed work, not completed external effects.

Uninstall by stopping session/optional workers, backing up Codex config and removing only this server entry, then archiving the project if desired. Keep authorized assignment directories. The previously approved CurrentUser RemoteSigned change has its original rollback receipt; this upgrade did not make further Windows security-setting changes.

## Reproduce native acceptance

Run `node scripts/ultimate-acceptance.mjs` for an explicit new synthetic assignment fixture and visible native Office/screenshot workflow. Run `node scripts/ultimate-recovery-acceptance.mjs` for a new owned Undo/checkpoint/reconnect fixture; its test-only approval callback is clearly recorded. Both leave created Office documents open and avoid personal source files. Screenshot acceptance requires an unlocked desktop with recent physical user activity and approved process names. Do not substitute a stub for unavailable live evidence.

For the opt-in full Windows/OCR/registration test suite in this installation:

```powershell
$env:ACADEMIC_TEST_PYTHON = 'C:\Users\Hajzzy\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:WINDOWS_LIVE_TESTS = '1'
$env:CODEX_REGISTRATION_LIVE_TESTS = '1'
npm test
```

The registration acceptance uses disposable configuration, not another write to the personal Codex configuration. The two owned standalone Word-render tests skip when a Word session is already running; separate live-session acceptance covers native edits. The symlink test skips if the Windows token lacks creation privilege, while junction/hardlink restrictions remain tested.

## Connected Codex acceptance

2026-11-05 browser policy update: the user authorized arbitrary ordinary HTTP(S) destinations. `config.json` now includes an explicit `*` origin policy; the original was backed up. The Playwright adapter reuses the already installed Chrome executable with a separate automation profile when bundled Chromium is absent. `BROWSER-ANY-URL-VERIFICATION.json` records fresh STDIO previews for three unrelated URLs, rejection of a credential-like query, and an actual dedicated-browser navigation to `https://www.onlinegantt.com/#/gantt`. No production host/local dialog was exercised by that navigation fixture. Protected `academic_coding_test` execution still requires Codex host acceptance and the separate Windows dialog; a host decline means no code was run. Reconnect the MCP server after this code/configuration update.

The current Codex chat actually discovered 163 tools, read version 3.0.0 over STDIO, attached an existing Word session, inserted one paragraph into the owned recovery fixture, saved the same document and read the paragraph back while preserving the original text. `ULTIMATE-CODEX-LIVE-VERIFICATION.json` records the native transaction/checkpoint and readback. This connection has already reloaded; another restart is not required for this verified chat. Reconnect only after future source/config changes.

`ULTIMATE-POLICY-VERIFICATION.json` records real STDIO trusted-workspace edit/move/rename with zero elicitation requests, backup contents verified, and one denied protected non-workspace edit preserving its original. `VSCODE-CLI-VERIFICATION.json` records actual --reuse-window/--goto dispatch only; it does not assert unsaved editor activation or visible line position. See [the checklist](ULTIMATE-CHECKLIST.md).
