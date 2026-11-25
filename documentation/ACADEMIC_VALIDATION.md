# Academic upgrade validation

This is the v1.1 historical acceptance record. Current v1.2 results are in [V1_2_VALIDATION.md](V1_2_VALIDATION.md).

Upgrade date: 3 November 2026. Version 1.1.0 adds academic modules in place; original functionality remains available. The source baseline is backed up under protected `.state/upgrade-backups`. No new packages, OCR engines, model downloads, compilers, services or system-wide settings were installed or changed.

## Verified implementation

| Capability | Actual evidence |
|---|---|
| Structured PDF/Office/code | Real PDF page numbers/vector tables/raster rendering; DOCX headings/styles/headers/footers/equations/tables/images; PPTX slide order/notes/tables; XLSX formulas and cell locators; C/C++ extensions; hostile XML and raster dimensions refused. |
| Scanned PDF | Real synthetic scanned PDF → PNG → installed WinRT OCR, English text/bounds and page/hash provenance. |
| Discovery and semantic retrieval | Actual SQLite FTS5, cursor batches, incremental hashes, citation resolution, stale/revoked withholding; genuine corpus LSA retrieves related text lacking the query word; worker cancellation stays responsive. |
| Previous style | Measured and saved DOCX font/size/margins/spacing evidence; partial current overrides preserve other measured attributes; original template and unrelated ZIP parts preserved. |
| Task reasoning and memory | Real SQLite/reopen, acyclic plans, revision conflicts, source-grounded host packets, invalid quotes/citations/measurements rejected, reviews invalidated on changed answers/outputs, cancellation and interruption recovery. |
| Deliverables | Actual rich DOCX, direct PDF, cached-formula XLSX and native PPTX create/read round trips; original/output overwrite refusals; real Word COM PDF export; native page image visually inspected and readable/unclipped. |
| Coding | Real Node/Python processes and stdin, compile-stage failures, expected output/exit comparisons, timeouts, source/copy/command/artifact hashes, task-linked evidence and cancellation. Native-token response is explicitly stubbed only in mechanics unit tests. Production elevated/untrusted refusal is tested with the real Windows token. |
| Research | Real local HTTP fixture GET, fetched metadata and null missing fields, redirects/origin revocation, bounded responses, no cookies or uploads, source authority left unestablished. |
| QC and completion | Actual source/output freshness, coverage, laboratory measurement blockers, current host reviews, coding-restriction review and JSON/Markdown QC reports. Unknown technical/layout correctness never becomes an automatic pass. |

## Integrated verification

The final full `npm run check` ran with `WINDOWS_LIVE_TESTS=1` and `CODEX_REGISTRATION_LIVE_TESTS=1`: **110 tests passed, 0 failed, 0 skipped**, including the added coding cancellation/restriction regressions. TypeScript build, legacy STDIO smoke and the academic STDIO end-to-end fixture all passed in that same check. No owned Word process remained afterward.

A final narrow Word-rendering improvement then refreshed only safe TOC/PAGE/NUMPAGES fields in memory before PDF export. Its focused native suite passed **4/4**, with actual TOC headings appearing in both contents and body, `Page 1 of 1`, unchanged source hash, and verified normal/abort cleanup. The resulting one-page PNG was visually inspected and readable/unclipped. The final TypeScript build also passed. The full suite was not unnecessarily repeated for this isolated bridge change.

`npm run test:smoke` discovers **110 tools**, checks **90 required-input schemas** with invalid values, verifies legacy file/command restrictions and host-denied deletion through the official SDK STDIO transport. The manifest/reference are regenerated from actual discovery.

`npm run test:academic` copies the built server into a new isolated project-owned fixture installation, launches it over real STDIO, creates the requested assignment folder tree, indexes lecture material, exchanges a scripted source-grounded host-result packet, generates DOCX/PDF/XLSX/PPTX, verifies a calculated value of 6, extracts the outputs and receives an actual PNG MCP image. It preserves the source, writes a QC report, and correctly refuses finalization while technical/layout reviews are missing. The scripted host fixture is not represented as an AI completion. It opens no visible application and uploads nothing.

The locked dependency audit reports zero known vulnerabilities. No dependencies changed in this upgrade. This does not assess unknown vulnerabilities, Windows/Office/runtime security or every possible assignment.

## Remaining operational requirements

- Run coding tools under a normal, non-administrator token; this execution session is elevated and production coding correctly refuses it.
- Configure exact trusted compile/run command IDs. C/C++ toolchains and javac are absent; installation needs approval. No real OS isolation backend is configured, so untrusted execution is blocked.
- Real assignments still need Codex review of questions, technical facts, units, diagrams, citations, restrictions and every rendered final page. Provenance checks are not proof of scientific truth or actual laboratory measurement.
- Native Word export refuses existing Word sessions and active/external content. Other installed app workflows and original interactive desktop/Recycle Bin consent acceptance are unchanged.
- MySQL/PostgreSQL live-service acceptance remains unverified from the original project; this upgrade did not install or alter them.
- No matching server entry was found in the normal personal Codex config. Direct STDIO and isolated Codex parsing work; actual Desktop connection/restart depends on the user's selected configuration and explicit registration approval. No personal config was changed.

## Reproduce

```powershell
$env:WINDOWS_LIVE_TESTS = '1'
$env:CODEX_REGISTRATION_LIVE_TESTS = '1'
npm run check
npm run reference
npm audit
```

Tests use synthetic project-owned files. Native Word tests refuse/skip a busy personal Word session; close Word yourself before the full acceptance pass. The source backup and academic state are private, ignored directories, not committed application data.
