# Historical 1.2 README

Retained for history; current instructions are in ../README.md and ULTIMATE-V3.md.


The remainder records the original 1.2 delivery. Its version/tool counts, disabled-capability defaults and old-machine registration statements describe that earlier snapshot. Use the upgrade guide and current config for 3.0.

A local Windows 11 MCP server for authorized files, document reports, applications, UI Automation, a dedicated Playwright browser, approved development commands, and databases. It uses the official MCP TypeScript SDK v2 over STDIO. No HTTP service, administrator launcher, arbitrary shell tool, or personal browser-profile access is provided.

Version 1.1 adds an Assignment and Coding Assistant **inside the existing server**: structured document extraction, English scanned-page OCR, SQLite full-text/corpus-LSA discovery, source citations, task checkpoints, grounded Codex reasoning, DOCX style matching, rich document/spreadsheet/presentation generation, coding test cases, and quality-control reports. Normal workflows use libraries/APIs and do not move the cursor. See the [upgrade plan](documentation/ACADEMIC_UPGRADE_PLAN.md), [academic workflow guide](documentation/ACADEMIC_ASSISTANT.md), and [upgrade validation](documentation/ACADEMIC_VALIDATION.md).

Version 1.2 connects saved OCR to canonical indexing/citations, enforces requested final formats and actual answer presence, and adds reusable source-evidenced writing guidance plus advisory topic/software/effort briefs. The [master-prompt re-audit and technical plan](documentation/MASTER_PROMPT_AUDIT.md) identifies both fixed defects and remaining partial requirements. See [v1.2 verification](documentation/V1_2_VALIDATION.md) for the current acceptance record.

## Current delivery status

The upgraded project builds and exposes 115 tools while retaining all original tools. The full check passes 125 tests with no failures or skips, plus real STDIO discovery and the four-format academic workflow. No new software or dependencies were installed. Interactive desktop consent/recycling and MySQL/PostgreSQL still need their documented live acceptance. The inspected normal Codex config has no entry for this project; another client/config layer may differ. No personal Codex configuration was changed. See [V1_2_VALIDATION.md](documentation/V1_2_VALIDATION.md) for current results; the earlier validation files retain historical baselines.

## Start here

Use a normal, non-administrator terminal in this project directory:

```powershell
npm ci --ignore-scripts --cache .npm-cache
npm run configure -- --init
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.state\browsers'
node node_modules/playwright/cli.js install chromium
npm run build
$env:WINDOWS_LIVE_TESTS = '1'
npm test
npm run test:smoke
npm run test:academic
node scripts/register-codex.mjs
```

Dependencies and Chromium have already been installed in this copy. The final command only prepares and displays registration. After reviewing [codex-registration.toml](documentation/codex-registration.toml), run `node scripts/register-codex.mjs --apply` locally and type `REGISTER` if you approve. It backs up and preserves your existing Codex configuration. Restart Codex Desktop afterward. See [connection and uninstall instructions](documentation/CODEX.md).

Initial file access is limited to this project's `workspace` directory. Desktop control starts disabled. Only Notepad and the harmless Node version command are initially configured. Local browser origins are initially `http://localhost:3000` and `http://127.0.0.1:3000`. No database is configured.

File/output/system operations support previews through `dryRun: true`, which is the default. Apply with `dryRun: false`. Explicit task creation/checkpoint/review tools persist the requested metadata immediately; they do not execute a workflow implicitly. File deletion supports one ordinary file at a time through the Windows Recycle Bin. File overwrite and destructive actions require host elicitation followed by a separate Windows dialog; declining either leaves the target unchanged. Unsupported consent mechanisms fail closed.

Emergency stop: run `npm run stop`, call `system_emergency_stop`, or create `.state/STOP`. This aborts managed work, closes the dedicated browser, and stops owned command sessions. It cannot undo completed external changes or close applications opened for the user. Resume requires `npm run configure -- --resume` locally, then restart the MCP process.

## Documentation

- [Setup and authorization](documentation/SETUP.md)
- [Windows requirements and acceptance tests](documentation/WINDOWS.md)
- [Codex connection, registration, and uninstall](documentation/CODEX.md)
- [Tool reference](documentation/TOOLS.md) and [machine-readable schemas](documentation/tool-manifest.json)
- [Supported document formats](documentation/FORMATS.md)
- [Architecture](documentation/ARCHITECTURE.md)
- [Security boundaries](SECURITY.md)
- [Testing and verification](documentation/VALIDATION.md)
- [Troubleshooting](documentation/TROUBLESHOOTING.md)
- [Development checklist](documentation/CHECKLIST.md)

## Typical use

Ask Codex to list authorized roots, preview a file organization plan, inspect an authorized project, generate a report in `workspace`, or test an authorized local website. For text edits, first read the file and pass its returned SHA-256 as `expectedSha256`. Configure the exact application, website origin, command, or database locally before requesting its integration.

Approved commands execute trusted code as your Windows user. Their directory allowlist controls where the command starts; it is not an OS sandbox for child code or its network traffic. Read [SECURITY.md](SECURITY.md) before authorizing additional commands or broad directory roots.

## Sources

The implementation follows the [official MCP v2 SDK](https://ts.sdk.modelcontextprotocol.io/v2/), [STDIO server guide](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server.html), and [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Package versions are locked in `package-lock.json`.
