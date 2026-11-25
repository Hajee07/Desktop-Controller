# Security boundaries

## Version 3.0 additions

The current architecture and acceptance scope are in [ULTIMATE-V3.md](documentation/ULTIMATE-V3.md). Codex remains the only reasoning engine. The persistent queue runs only finite, allowlisted prepared operations; it waits for Codex or user review when additional reasoning or uncertain effects are encountered. An optional visible worker must be started explicitly. No startup service was installed.

Current scoped Codex tool policies approve ordinary tools while the default remains `prompt`. Internal protected-operation approvals remain mandatory even when the host approves a tool. `permissions.automaticWorkspaceEdits` applies only to the project's authorized `workspace`, not all authorized personal roots. Original live Office edits/saves outside it require host and local confirmation. Capture and UI control are independent from launch permission. Policy changes require local configuration and reconnection.

Native Office tools attach saved, authorized documents using explicit identities and current revisions. Word edit batches record request hashes, acquire cross-process leases, checkpoint unsaved content and group native Undo. Uncertain edits are recorded rather than automatically retried. Word session shutdown never closes the user's Office applications. Offline DOCX writes refuse an existing Office owner lock; do not create competing writers.

Window evidence uses a requested approved application's actual PrintWindow output without focusing it. Screen/region capture additionally requires explicit approval and checks every intersecting visible window; inaccessible secure-field inspection fails closed. No background capture was added. Cropped/resized images are recorded as derived images, not unaltered evidence.

Managed storage is capped at 20,000,000,000 bytes with category and disk-free reservations. This is application-level accounting, not an NTFS quota, RAM limit or Windows process sandbox. Native applications, external programs and the user can write independently. File streaming, binary parsing, Office XML, extracted text and client context have separate bounds. Automatic cleanup is restricted to expired ordinary files directly in protected server temporary storage; it never removes sources, backups or task history. Private task/index/checkpoint content is distinct from the metadata-only audit database.

The remaining sections describe inherited controls. Where an earlier blanket prompt/foreground statement differs, the explicit scoped 3.0 policy above and actual configuration are authoritative.

## Authorization

The server runs as the launching Windows user over local STDIO. It never requests elevation. Treat its configuration and approved source code as trusted local policy. Only the local configuration CLI or a user-edited configuration can authorize directories, apps, origins, commands, and databases. No MCP tool changes these allowlists or clears emergency stop.

Paths must be absolute and local. Traversal, UNC/device paths, alternate data streams, unsafe Windows names, junctions/symlinks, file hardlinks, common credential stores, browser-profile locations, system folders, and the server's code/configuration/state are blocked. Each file operation checks source and destination paths; edits also require a source hash and recheck after approval. Filesystem operations are bounded; bulk deletion and recursive folder moves are unsupported.

These are application-level controls. A hostile process running as the same Windows account can race filesystem changes, edit configuration, replace executables, or read this server's memory. Node does not provide handle-relative Windows filesystem access for all operations; canonical path rechecks reduce but cannot eliminate that threat. This project is not a containment boundary against an already compromised account.

## Approvals and previews

Write tools default to dry-run previews where supported. Destructive tools advertise MCP destructive hints. Registration defaults to `prompt` and applies scoped ordinary-tool overrides. Protected original overwrites/deletion, scripts, database changes, application closure and external/foreground actions require MCP host approval and a separate local Windows dialog. Modern MCP approval state uses an unpredictable server-stored nonce bound to the complete arguments and exact approval summary, expires after two minutes, and is consumed once. Host denial, missing capability, altered arguments, local cancellation, timeout, or emergency stop fails closed.

The server cannot attest to an arbitrary host's UI implementation; the host must truthfully relay elicitation decisions. The local Windows dialog remains a separate required step. Tests that replace a dialog with a stub are identified as adapter tests, not live consent verification.

New, non-destructive file creation and exports do not require a second Windows dialog. They still use exclusive creation and an authorized destination. Recycle operations preserve a backup and refuse multi-file/directory deletion; use restore or the Windows Recycle Bin to recover. Backup content is private sensitive data and is not encrypted by this application. Windows account permissions protect it; configure BitLocker/ACLs separately if needed.

## Desktop and browser

Desktop control uses UI Automation identities, approved processes, unlocked input desktop checks and recent user activity. It does not use global input hooks, keystroke recording, background screenshots, clipboard reads, coordinate clicks, or password entry. Activity age is a conservative proxy for presence, not proof of physical presence. The local approval dialog supplies the user's active decision.

Screenshots are requested explicitly and saved only in authorized paths. The legacy desktop capture targets an approved foreground window; the new native capture also supports a specified approved window without changing focus. Both refuse password/credential controls or incomplete secure-tree inspection. Browser capture rejects visible credential/payment fields and masks ordinary inputs. Accessible labels can still contain personal information deliberately displayed by an approved app/site; use only authorized content.

Playwright owns a separate profile under `.state/browser-profile`. It exposes no cookie, storage, session, browser-profile, arbitrary JavaScript, or saved-password extraction API. The browser policy accepts either exact origins or an explicitly configured `*` wildcard for ordinary HTTP(S) URLs; the current user-authorized installation uses `*`. Redirects and resource requests follow this policy. Non-GET/HEAD/OPTIONS requests are blocked unless one exact URL/method is approved for one action; WebSockets and service workers are blocked. GET requests may have website-defined side effects and navigation therefore requires consent. URL credentials, credential-like query parameters and browser password access remain denied. The browser can use the approved installed Chrome executable with a dedicated profile when Playwright Chromium is absent. Do not use this browser for personal banking/password workflows.

## Commands and databases

There is no arbitrary PowerShell string or command-concatenation interface. The bridge selects a fixed operation with separately encoded JSON. Development commands use an absolute `.exe` plus locally configured fixed arguments, with no shell, bounded output, timeouts and a sanitized child environment. Every non-version command requires confirmation even if its policy flag is mistakenly set false. `allowNetwork` documents requested intent; it does not enforce Windows network isolation. A trusted script can access other data available to your account. Do not authorize untrusted repositories or dependency installers without reviewing their effects.

SQLite reads use a read-only connection in a cancellable subprocess. Remote database reads use read-only transactions, statement limits and a restricted SELECT/function subset. Writes are parameterized INSERT/UPDATE/DELETE only, require explicit per-connection enablement and dual confirmation, and cap direct changes at 100 rows. Triggers/cascades can affect additional data; use least-privilege database accounts and test instances. SQLite writes get online backups. MySQL/PostgreSQL full single-database backups use database_backup with a configured approved native dump command; bounded query exports are not full backups. Native dump credentials are provided only through ephemeral child environment variables and personal credential-file fallback is disabled. Remote database TLS settings are not exposed by the current schema; use trusted local services or a secured local tunnel.

Database passwords come from named environment variables. They are never stored in source, config, audit or returned connection metadata. Tools do not read general environment variables. Child project scripts do not inherit arbitrary database/API secrets. Existing data can contain secrets; explicit query/read results are returned to the host by design.

## Academic data and execution

Version 1.1 stores authorized document excerpts/index text, host answer history, style metrics and fetched research metadata in separate protected `.state/academic` databases. These stores contain private academic content and are not the metadata-only audit log. They are not application-encrypted. Common credential patterns are refused in task memory; this is not comprehensive personal-data detection. Keep secrets and unnecessary personal details out of task descriptions and answer history.

Every cached citation/search result is reauthorized and source-hashed. Corpus LSA is trained in a cancellable worker and bounded to its stated corpus/vocabulary/dimensions; it is not a pretrained reasoning model. Retrieved text, figures, website metadata and prior submissions remain untrusted evidence and never authorize tool execution.

Saved OCR is additionally bound to source/page/language/raster provenance. Task snapshots and citation checks include canonical identity, so replacing OCR cannot silently reuse old approvals merely because PDF bytes are unchanged. Typed deliverable contracts require actual final format/structure and committed answer presence; positive host notes alone cannot override those machine failures. Advisory briefs do not alter authoritative task requirements; changed constraints must be reviewed through the task plan. Reusable writing guidance requires nonempty actual source excerpts and current template hashes.

Codex performs reasoning through explicit prepare/commit contracts. The server does not manufacture model output, measurements, bibliographies or correctness assertions. It checks provenance and records host reviews with their origin and input/output hashes. Changed sources/answers/artifacts invalidate prior work and reviews. Laboratory tasks block missing supplied observations. Coding completion requires actual hash-bound test evidence and separate review of stated assignment restrictions.

The academic coding engine refuses elevated tokens and untrusted code because no real OS sandbox is configured. Copying files into a working directory does not confine the child process. Only trusted fixed configured commands may run under a normal Windows token, with bounded time/output, sanitized environment, explicit test fixtures and approvals. Commands must remain foreground; deliberately detached descendants can escape same-user process-tree cleanup. No compiler, isolation backend, model or OCR language is installed automatically.

Cursor-free Word rendering uses a new owned process under a kill-on-close job and refuses if another Word session is already open. It disables macros/link updates, reads a clean DOCX, refuses active/external content, preserves the source hash and publishes only a new PDF. Rendered page images still require visual inspection. PDF/image raster bounds are checked before allocation; malformed or unsupported documents are denied.

API-first research uses exact authorized origins, GET only, bounded responses, checked redirects and no cookies/authentication. Retrieved metadata is a source claim, not automatic proof of peer review, author identity or scientific accuracy. No assignment submission or external document upload is added by this upgrade.

## Audit, cancellation and recovery

SQLite audit stores only timestamp, tool name, status and elapsed time. It discards arguments, file paths, URLs, SQL, typed text, errors and outputs rather than relying on imperfect secret-pattern redaction. Browser console errors are separately bounded and redacted in memory. Backups and approved screenshots/documents remain private user data; delete them explicitly when no longer needed.

Timeouts/stop abort managed requests and owned subprocesses and close the dedicated browser. Completed side effects cannot be rolled back universally. Stop is persistent and cannot be cleared through MCP. The server does not kill arbitrary processes, critical Windows processes or user applications; application closure only posts a graceful close request and leaves unsaved-work prompts to the user.

## Reporting a problem

Stop the server with `npm run stop`, disable its Codex MCP entry, and retain a minimal reproduction containing only disposable fixtures. Do not include credentials, browser-profile files, private documents, or full audit database backups in issue reports.
