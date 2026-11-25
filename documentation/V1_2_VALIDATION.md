# Version 1.2 audit fixes and validation

Validated on 3 November 2026. This is an incremental upgrade to the existing server, with no software/dependency installation, personal-document changes, Codex registration or system-wide configuration changes.

## Defects fixed

1. Saved OCR is now canonical source evidence, not an isolated tool response. A protected SQLite cache binds recognized text to PDF SHA, page, language, raster hash and integrity fingerprint. Extraction, indexing, source resolution and host reasoning use identical source/segment IDs. New OCR invalidates the affected index/model; source-byte or OCR-provenance changes invalidate old citations and task snapshots. Revoked sources cannot expose/resurrect observed-revoked cached evidence.
2. Metadata discovery finds scanned/empty files without requiring text chunks, returning `segmentId: null` and an explicit needs-OCR/citation-not-ready condition.
3. Reviewed deliverable contracts enforce requested formats, names/paths and per-question mappings. Finals must parse as their claimed format and contain the full committed prose, or exact tested coding bytes. Unrelated/renamed/blank/malformed files, missing outputs and missing answers block completion despite positive host review notes. Current canonical citations are checked at verification and finalization.
4. Reusable writing/reference/calculation/course guidance is stored as source-evidenced host interpretation alongside measured formatting. Empty/invented quotes, source swaps, changed templates and revoked access are rejected.
5. Reviewed topic/software/constraint notes and assumption-based effort intervals persist as **advisory** briefs. They do not override task-plan requirements. Source/observation authorization and semantic scope changes invalidate cached briefs.
6. QC exports redact revoked planned paths even before artifacts exist; historical completion metadata without the new integrity checks is reported stale rather than silently verified. Required-text QA normalizes presentation whitespace/Unicode.

## Exact verification results

`npm run check` with `WINDOWS_LIVE_TESTS=1` and `CODEX_REGISTRATION_LIVE_TESTS=1` passed:

- Strict TypeScript build.
- **125 tests passed, 0 failed, 0 skipped.**
- Official SDK STDIO discovery: **115 tools**, **95 required-input schemas** exercised with invalid values, legacy restrictions and host-declined deletion verified.
- Real four-format academic STDIO fixture: actual DOCX/PDF/XLSX/PPTX, checked formula result 6, actual MCP PNG page content, preserved source, QC report, no visible apps/uploads, correct completion refusal pending technical/layout review.

The independent workflow regression uses a real synthetic scanned PDF, Windows OCR, SQLite, source extraction and document generation with **no provider/token/OCR stubs**. It indexes the scan before OCR, then verifies same-binary-SHA reindexing and shared canonical IDs through search/resolve/reasoning/answer readback. It proves revoked/changed source denial, wrong TXT/missing PDF/unrelated valid PDF refusal, actual final content checks, and rejection of a previously ready finalization after OCR changes without PDF byte changes. Explicit refresh/replan/recommit/recheckpoint/current reviews then allow valid DOCX/PDF finalization. Original scan bytes remain unchanged.

The coding mechanics tests retain their existing disclosure: real Node/Python processes run under a stubbed non-elevated capability response in unit fixtures; production execution under the actual elevated token is refused. The new workflow regression does not execute code or launch Word. The full suite also passed existing real native OCR, owned Word rendering/TOC/page-field/cancellation checks and read-only Windows integration.

No packages changed. The locked dependency audit is recorded separately and does not prove runtime/Office security or scientific accuracy. The source/runtime backups remain under protected `.state/upgrade-backups`; the runtime backup preserves v1.1 before these integration fixes.

## Limits and remaining work

The [master-prompt audit and technical plan](MASTER_PROMPT_AUDIT.md) separates implemented support, host responsibilities, partial features and operational requirements. This release does not claim a standalone LLM daemon, arbitrary rich-template editing, bibliographic authority verification, unlimited extraction, pretrained semantic embeddings, server-side parallel service dispatch or OS-isolated untrusted execution.

The normal inspected Codex config still has no matching project entry. It was not changed or registered. Only the current approved workspace/commands remain authorized. C/C++/javac and a real isolation backend are not configured; software/configuration changes still require user authorization. Real assignment scientific accuracy, units, citations and every rendered final page still require source-aware review.

## Reproduce

```powershell
$env:WINDOWS_LIVE_TESTS = '1'
$env:CODEX_REGISTRATION_LIVE_TESTS = '1'
npm run check
npm run reference
npm audit
```

Tests use project-owned synthetic fixtures. No personal files or existing app sessions are used as mutation targets.
