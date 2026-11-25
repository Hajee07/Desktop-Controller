# Validation record — 3 November 2026

## Environment and build

Windows 11 build 26200 / 25H2; x64. Node.js 24.15.0 (Krypton LTS), npm available, Windows PowerShell 5.1, PowerShell 7, Git, Python and Codex available. The normal installed Codex CLI used in registration compatibility tests reports 0.166.0. The restricted execution runner also exposes an alpha Codex binary; actual registration preview detects the normal installation.

`npm run build` passes with strict TypeScript and no emit on errors. Dependencies and Chromium were installed inside this project. `npm audit --json` reports **zero known vulnerabilities** for the locked dependencies. The patched `image-size` override was verified with actual PPTX generation/read tests. Dependency audit does not assess the installed Node/Windows runtime or prove absence of unknown vulnerabilities.

## Automated results

The final combined suite ran 58 tests: **57 passed, 0 failed, 1 opt-in registration test skipped**. That registration test was then enabled and its complete 10-test suite passed with **0 failures and 0 skips**. Thus all 58 distinct tests passed across these runs. The Windows and Playwright live fixture tests were enabled; no personal documents or applications were modified.

| Area | Count | Evidence |
|---|---:|---|
| Browser | 3 | Real dedicated Chromium against loopback fixture: navigation/search, extract, ordinary fill, blocked credentials, exact approved POST, blocked unapproved POST, upload, download, screenshot, console/test/close. |
| Commands | 1 | Allowlist, exact argv, inert previews, unauthorized command/cwd denial, confirmation even for misconfigured script flags. |
| Databases | 4 | Actual SQLite read/write/rollback/online backup/export/cancel, environment-only credential failure, SQL restrictions; native dump plan validations. |
| Development sessions | 1 | Actual owned temporary Node children: start, bounded/redacted output, four-session limit, stop, cancellation and emergency cleanup. |
| Development/disconnect | 2 | Actual manifest inspection across project types; normal resource disposal without creating a stop sentinel. |
| Files/documents | 12 | Real create/read/edit/copy/move/rename/compare/organize, source-hash races, backups/restore, one-file recycle adapter, hardlinks, abort, all nine report formats and PDF/DOCX/XLSX/PPTX round trips. |
| Registration | 10 | Preserve existing TOML/comments/BOM/servers, denial, backups, duplicates/malformed config, concurrent edits, links, lock, env names only; installed Codex parses isolated configuration. |
| Security | 10 | Actual Windows junction/hardlink denial, credential/device/ADS/traversal checks, state alias refusal before writes, SQLite audit secret discard, persistent/idempotent stop, owned process timeout and environment sanitation. |
| MCP approval | 6 | Real MCP client/server in-memory transport, modern and legacy approval paths; host denial, local denial, actual approved backed-up edit, changed-input/replay refusal and emergency cancellation. Local dialog implementation is stubbed for these automated tests. |
| Windows/desktop | 9 | Real bridge compilation and read-only system/drives/windows/active/installed/running apps; adapters verify GUI dispatch and guards without personal app interaction. |

Final `npm run test:smoke` starts the built server as a separate process through official SDK STDIO transport. It discovers **63 tools**, exercises **51 required-input schemas** with invalid values, creates/reads an isolated fixture, executes the approved Node version command, rejects outside-root/unknown commands, and rejects deletion after host denial. The fixture survives denied deletion. SDK JSON-RPC parsing succeeds; stdout carries protocol only. `documentation/tool-manifest.json` and `TOOLS.md` come from this discovery.

The registration preview ran successfully with the actual project and Node paths, targeting the existing user config **read only**. The installed Codex `mcp list/get` accepts the generated table in a disposable `CODEX_HOME`. The real `C:\Users\MSI\.codex\config.toml` has not been modified. `mcp get --json` omits approval-policy fields, so the Desktop prompt setting still requires live acceptance.

## Remaining live acceptance work

These are implemented paths, but are **not declared live-verified**:

1. A user-supervised local Windows confirmation dialog and approved GUI input/capture/launch/close on a disposable test app. Test ordinary fields, password refusal, cancel, locked/idle desktop and unsaved-work prompts. See WINDOWS.md.
2. Actual one-file Windows Recycle Bin round trip using a disposable fixture after both approvals. The adapter backs up first and native IFileOperation refuses permanent-delete fallback; native helper compilation and policy are tested, actual recycling awaits supervision.
3. MySQL/PostgreSQL connection/read-only/write integration and actual native `mysqldump`/`pg_dump` output. No services or dump utilities were installed or configured on this machine. Native dump previews validate exact named connection/output and exclude credential-file fallback; actual remote execution is unverified.
4. Full restart and tool invocation from Codex Desktop after the user approves live registration. STDIO client and isolated CLI compatibility are verified independently.
5. Each separately installed third-party app (Word/Excel/PowerPoint/VS Code/Terminal/Android Studio) must be explicitly authorized and acceptance-tested. Accessible UI support varies by app; inaccessible/secure/canvas-only workflows fail or are unsupported.

## Reproduce

```powershell
npm run build
$env:WINDOWS_LIVE_TESTS = '1'
$env:CODEX_REGISTRATION_LIVE_TESTS = '1'
npm test
npm run test:smoke
npm run reference
npm audit
```

The test runner sets the project-owned Playwright browser path automatically. Windows tests are read-only; GUI mutations use fixtures/adapters. Native Windows queries, browsers and child-process tests need permission from the execution host and cannot run in some restricted sandboxes. No execution-policy bypass, security-service changes or administrator escalation is part of the server.

## Tool testing guidance

For each tool, review its exact schema in TOOLS.md, use a fresh authorized fixture and start with its default preview. Filesystem/report tools are covered by filesystem.test.ts; every browser tool is covered by browser.test.ts; SQLite tools by database.test.ts; app/window/desktop tools by windows.test.ts plus the manual matrix; commands/development by commands.test.ts, development.test.ts and development-sessions.test.ts; audit/stop by security.test.ts/server.test.ts. The integration reference identifies unsupported behavior rather than returning fake success.
