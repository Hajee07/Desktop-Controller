# Troubleshooting

| Version 3.0 symptom | Action |
|---|---|
| Fresh build but old tool names | Fully quit/reopen Codex or reconnect `windows_laptop`; a new chat can keep an old STDIO process. Current fresh discovery is recorded in `ULTIMATE-FINAL-VERIFICATION.json`. |
| `WORD_STALE_REVISION` / `OFFICE_STALE_REVISION` | Inspect the exact target again and use fresh ranges/revisions. Check transaction history before retrying an uncertain edit. Word can change field/format state independently. |
| `OFFICE_DOCUMENT_BUSY` | Another managed edit holds the document lease. Wait for its outcome; do not start an offline competing writer. |
| Live document missing | Save the document to an authorized ordinary DOCX/XLSX/PPTX path and inspect the list again. Discovery does not start applications or expose unauthorized documents. |
| Queue waits for Codex/user | Supply reviewed prepared steps through `execution_task_resolve`. Paused tasks use resume. Interrupted effects require review; no automatic replay. |
| Queue stops when Codex closes | Session-owned helpers stop with the MCP connection. Start the optional visible `npm run worker` for finite prepared work; it cannot continue AI reasoning. |
| Quota/category/disk reserve denial | Inspect `system_storage`. Reduce new output size or explicitly move/archive your own files. Originals, backups and task history are never automatically purged. |
| Large Office archive accepted but parser rejects it | The 2 GiB file/archive ceiling is separate from 256 MiB binary parsing, 40 MiB XML, text/page/image bounds and Codex context limits. Use paginated/chunk tools or a supported native operation. |
| Dashboard executable missing | Install nothing automatically: verify an existing .NET 10 SDK, then run `npm run build`. The dashboard uses WinForms, not PySide6. |
| Screenshot empty or rejected | Use a supported ordinary approved window on an unlocked desktop with recent user presence. GPU/DRM/secure/inaccessible windows may fail; never substitute synthetic evidence. |

| Symptom | Action |
|---|---|
| Server exits immediately | Run `npm run configure -- --show`, then `npm run build`. Confirm config exists and authorized roots exist. STDIO must be launched by a host; startup diagnostics go to stderr. |
| New MCP tools do not appear | Review registration preview, apply locally only if approved, fully restart Codex Desktop, and inspect `codex mcp get windows_laptop`. Verify this chat's host allows local custom MCP servers. |
| Host cannot show approval form | The operation fails closed. Update/use an MCP client with elicitation support. A `confirm: true` tool argument cannot bypass approval. |
| Windows dialog not visible | Check the interactive unlocked desktop and taskbar. Confirmation defaults to Cancel and expires with the tool deadline. Remote/noninteractive sessions can fail closed. |
| Desktop reports disabled | Authorize the application locally, then enable its exact process name with the configuration CLI. Restart the server. |
| UI element disappeared | Inspect again and use the fresh window/process/runtime element ID. Controls must be visible, enabled, ordinary fields and in the approved foreground process. |
| Screenshot denied | Close credential/payment fields and use an ordinary disposable app/page. Incomplete secure-field inspection is denied. Desktop PrintWindow support depends on the app. |
| PowerShell script blocked | Follow your organization's signed-script policy. The installer does not bypass execution policy or change it automatically. Sandbox-denied tests must run through the authorized host permission flow; do not disable security software. |
| Browser executable missing | This installation first uses the approved installed Chrome with a dedicated automation profile. If neither Chrome nor Playwright Chromium is installed, choose an approved browser setup; no browser is installed automatically. |
| Website origin not authorized | This installation explicitly authorizes `*` for ordinary HTTP(S) URLs. Reconnect the MCP server after configuration changes. Other installations may authorize exact origins instead. |
| Website missing styles/resources | With an exact-origin policy, authorize required resource origins locally. With `*`, resource origins are permitted; service workers/WebSockets and unapproved mutation requests remain blocked. |
| `academic_coding_test` says host confirmation declined | The host did not grant this protected code-execution step. Inspect the dry-run preview and accept the Codex confirmation plus separate Windows dialog if you intend to run that trusted code. If no prompt appears, check host approval support/policy. No MCP setting should silently run untrusted code. |
| App/website compatibility gap | This is bounded UI Automation and semantic Playwright control. Canvas-only controls, inaccessible UI, secure desktops, password workflows and personal browser sessions are unsupported. |
| File access denied | Check `configuration_get`, sensitive-path restrictions and links/hardlinks. Use a small ordinary project directory and avoid aliases, UNC paths or alternate data streams. |
| Edit refused as stale | Read again, compare the returned SHA-256 and request a fresh preview/approval. |
| Database cannot connect | Verify named config, service availability, environment variable NAME, account privileges and port. No production services are installed automatically. |
| SQL rejected | Use one SELECT or one parameterized INSERT/UPDATE/DELETE from the supported subset. No comments, multi-statements, PRAGMA, CTE or arbitrary functions. |
| Emergency stop active | Locally run `npm run configure -- --resume`, type `RESUME`, then restart the server. |
| Native Windows tests fail under a restricted runner | Run through the runner's explicit permission mechanism. Do not change execution policy or elevate the MCP server. |

Never paste credential files, personal browser profiles, database passwords or private document contents into diagnostics. Audit logs contain metadata only. Reproduce failures using a new project-owned fixture directory.
