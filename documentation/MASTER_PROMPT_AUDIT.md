# Master prompt audit and technical upgrade plan

Audit date: 3 November 2026. The newly attached master prompt is byte-identical to the previous specification (SHA-256 `dde3559fbf5a11da18bb30f0e66e61d5f4964069c462effeabf7465e7f1ecc37`). This audit extends the existing implementation rather than creating another server.

## Existing baseline

Version 1.1.0 contains the original 63 tools and 47 academic tools. Its recorded regression run passed 110 tests; native TOC/PAGE rendering subsequently passed its four focused checks. Real document extraction, English OCR, corpus LSA, SQLite task history, host-grounded reasoning contracts, Office generation and owned-process cleanup are implemented. These results establish the tested cases, not blanket completion of every sentence in the specification.

The re-audit found two integration defects that passing component tests had missed:

1. Scanned-page OCR returned real text but did not persist it as canonical indexed/citable document segments. A fully scanned source could not pass the grounded reasoning flow. Filename metadata search also joined through text chunks, hiding zero-text sources.
2. Task completion counted committed answers and any final artifact but did not enforce requested output formats or verify that the final files actually contained the committed explanations. An unrelated text file could satisfy that incomplete gate after host review assertions.

These are implementation defects, separate from missing user configuration. Version 1.2 addresses them with canonical OCR provenance and strict deliverable contracts/coverage. Regressions must exercise the complete workflows, not only isolated helpers.

## Requirement coverage

| Module | Existing implementation and boundary | Upgrade / remaining work |
|---|---|---|
| 01 Task understanding | Reviewed question/mark/format DAG plans; deterministic analysis is only a draft. | Add a reviewed topic/software/constraint brief and explicit effort interval with assumptions; no invented exact time estimate. |
| 02 Discovery | Authorized SQLite FTS5, filename metadata, bounded batches, real corpus LSA and resolvable citations. | Integrate fresh OCR into canonical extraction/index identity; make zero-text sources findable by metadata. Large-directory resumable traversal remains a separate improvement. |
| 03 Document understanding | Actual PDF page/table/image views; Office structure, formulas, captions, notes and code; installed English OCR. | Persist OCR segments/provenance. Diagram interpretation remains Codex vision; automated figure-to-caption semantic association and resumable extraction beyond format caps are partial. |
| 04 Previous answers | Measured DOCX formatting and paragraph metrics; host examines content. | Add reusable host-reviewed, source-evidenced writing/depth/reference/calculation/code/course guidance. Exact reproduction of every heading/table style remains partial. |
| 05 Reasoning | Codex-host prepare/commit packets, source IDs, quote checking, marks and observation labels. | Revalidate canonical citation identity after OCR correction, not binary SHA alone. Facts, equations and technical accuracy still require source-aware Codex review. |
| 06 Software selection | Direct-tool suggestions per deliverable; Codex makes contextual choices. | Keep API/library-first selection. No unnecessary app opening or automatic installation. |
| 07 Word | Rich new DOCX, guarded unique-run copy edits, measured body style, equations/fractions, images, PAGE/TOC and owned COM PDF rendering. | Broader rich edits, arbitrary template fidelity, general equation trees and automatic APA/IEEE bibliography formatting remain restricted/future work. |
| 08 Programming | Fixed command protocol, real stdin/cases, comparisons, hashes, cancellation and actual test evidence. | Normal non-admin token and explicitly configured trusted command IDs required. C/C++/javac were not found; untrusted execution is blocked until a real approved isolation backend exists. |
| 09 Research | Bounded authorized GET, redirect checks, actual metadata and dedicated Playwright fallback. | Metadata is not bibliographic authority. Direct fetched-reference-to-grounded-answer ingestion and external DOI verification remain separate extensions. |
| 10 AI integration | Real Codex-host reasoning interface; no ChatGPT GUI or fake model output. | External providers are optional and unconfigured. Do not extract Codex credentials or upload sources without explicit configuration/approval. |
| 11 Orchestration | Durable DAGs, revision checks, leases, checkpoints, interruption recovery and cancellation. | Currently host-coordinated: two ready steps are offered, normal MCP calls serialize. Server-side safe batch dispatch/parallel API execution is not yet implemented. |
| 12 Cursor-free execution | Native libraries/APIs, fixed CLI and owned COM; actual page images returned through MCP. | Preserve current boundaries; desktop UI remains an explicitly authorized fallback. |
| 13 QA | Freshness, provenance, observation/coding/review gates and QC reports. | Add typed requested outputs, actual structural parsing and per-question answer presence in final artifacts; preserve separate scientific/visual review. |
| 14 File management | Requested folder tree, exclusive new outputs, original preservation and backups. | Use explicit artifact names/versions; automatic full version-history browsing is not implemented. No portal submission/upload. |
| 15 Natural language | Codex plus the MCP workflow prompt coordinates contextual tool use. | A server is not an independent LLM daemon. Ask only for essential missing inputs or permission required for configuration/software/irreversible actions. |
| 16 Memory | Separate local task/index/style/research stores; current stage/history/configuration persists. | New reviewed brief/style guidance adds structured memory. Subject-to-template/project-to-command preference discovery and historical checkpoint-body versions remain future work. |
| 17 Implementation / integration | Modular upgrade, source/runtime backups, regression tests, isolated STDIO/CLI checks. | Current normal personal config has no matching server entry. Live client binding and user-specific source/tool permissions remain unverified and unchanged. |

## Version 1.2 implementation sequence

1. Preserve the working runtime. Add a protected OCR store with original source SHA, page, language, raster hash and actual recognized text. Canonical extraction incorporates only current authorized records; OCR correction changes canonical IDs. Invalidate affected index/model data.
2. Preserve metadata discovery for sources without text. Do not manufacture a segment/citation for an unreadable document; return a clear needs-OCR condition.
3. Add typed final-output contracts containing format, optional exact path/name and required question IDs. Infer only unambiguous legacy filenames. Ambiguous requirements require host review rather than a guessed pass.
4. Re-extract finals and verify their actual structure, current hashes and mapped answer content. Coding finals use exact tested-code evidence rather than requiring prose inside source files. Recheck canonical citations at verification/finalization.
5. Persist reviewed topics, constraints, required software and assumption-based work estimates. Persist reusable source-evidenced writing guidance with the existing measured profile. Invalidate these records when their underlying source/plan changes.
6. Add complete scanned-PDF→OCR→index→reasoning→generated-output regression and negative tests for wrong formats, unrelated finals, missing answers, stale OCR, source revocation and changed scope.
7. Build, run affected tests, then run the full check and regenerate actual tool schemas. Record exact results and remaining operational blockers separately.

## Implemented and verified in this pass

The sequence above is implemented in v1.2.0. The full check passed **125 tests with zero failures/skips**, STDIO discovery found **115 tools**, and the locked dependency audit reports zero known vulnerabilities. The independent real scanned-source workflow now reaches valid finalization and rejects stale OCR, wrong formats and missing answer content. Source-evidenced guidance and advisory topic/software/effort briefs are tested for staleness, revocation, source swaps and empty evidence. Advisory constraint notes do not amend authoritative task requirements; such changes must go through the reviewed task plan. See [V1_2_VALIDATION.md](V1_2_VALIDATION.md) for exact evidence and remaining limits.

## Next technical phases after these fixes

These are planned additions, not claimed features:

1. Resumable large-document/page/chunk ingestion and directory traversal, with continuation tokens bound to authorization/extractor version.
2. Source-backed bibliography rendering and a fetched-reference ingestion bridge; verify external metadata through approved official/academic endpoints.
3. Task-linked calculation evidence and explicit unit/dimensional checks for supported domains.
4. A bounded deterministic service dispatcher for safe read/new-file operations, preserving approval checkpoints and never replaying unknown external side effects.
5. Richer template/style fidelity, subject/project preference mappings and append-only historical checkpoints.
6. Optional compiler/JDK and OS isolation setup only after the user approves specific software/configuration changes.

Each phase requires focused regressions plus a source/output-hash-bound pilot. Scope/time estimates should be reviewed after its acceptance examples are selected; none is represented as a completed capability merely because it appears in this plan.

## Operational acceptance

No new directory permissions, executable command IDs, external origins, software or personal Codex entries are authorized automatically. The current normal config has no matching server entry; it authorizes only project `workspace` and `node-version`. The current token is elevated and production coding correctly refuses it. An actual assignment pilot requires its sources inside an authorized root and a normal non-admin launch for trusted code execution. This audit/repost is not permission to register the server or install a toolchain.
