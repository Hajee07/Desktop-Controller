# File and document capabilities

For 3.0 native live Office, OCR/academic operations, quota and processing bounds, see [ULTIMATE-V3.md](ULTIMATE-V3.md). The inherited table describes filesystem extraction/reports, not the full native adapters. This installation separately bounds binary parsing to 256 MiB.


The server extracts text; it does not execute Office macros, spreadsheet formulas, JavaScript in HTML, embedded programs, or linked resources. Read limits use `maxReadBytes` (schema default 5 MB; this installation and the example config use 2,147,483,648 bytes / 2 GiB, the supported maximum) and extracted text is capped at 2,500,000 characters. Office ZIP archives are capped at 5,000 entries. `maxOfficeArchiveBytes` limits the declared expanded package size (default/current 2 GiB); `maxOfficeXmlBytes` separately limits all XML/relationship parts (default/current 40 MiB). Text extraction does not decompress embedded images/media. XML is inflated with an actual byte bound and validated; DTD and entity declarations are refused. Traversal and content searches use `maxSearchEntries` and never follow links.

| Format | Read/search | Create/report | Edit |
| --- | --- | --- | --- |
| TXT, MD, JSON, CSV, HTML, CSS, JS, TS, PY, Java, XML, YAML, TOML, SQL | UTF-8 text | TXT, MD, JSON, CSV, HTML report tables; arbitrary UTF-8 file creation | Whole text replacement with source SHA-256 |
| PDF | Existing embedded text | Paginated title, headers, and row text | Read-only; generate a new report |
| DOCX | Main document text through Mammoth | Title and native Word table | Read-only; generate a new report |
| XLSX | Worksheet names and cell text/numbers/booleans; shared and inline strings; cached formula results | Native worksheet with inline strings, number/boolean cells, formatted headers, and frozen rows | Read-only; generate a new report |
| PPTX | Slide text and table text in slide-number order | Native title and table slides, 12 data rows per slide | Read-only; generate a new report |

CSV report output prefixes formula-like cells with an apostrophe. HTML reports escape cell text and contain no scripts. XLSX report strings remain strings, even when they begin with `=`. Reports accept primitive cells, at most 30 columns and 5,000 rows, with a 1 MB aggregate data limit; each row must match the column count. Reports always create a new file and refuse an existing output path.

Academic tools provide bounded WinRT OCR for supported installed languages; ordinary filesystem extraction alone does not OCR. Password-protected, encrypted, damaged, legacy binary `.doc`/`.xls`/`.ppt`, `.xlsm`, embedded media, image text, charts, presentation animations, and precise page-layout reproduction are not supported. PDF generation uses PDFKit's standard font, so full Unicode scripts and emoji need a future explicitly configured embedded font. Spreadsheet dates may appear as stored numeric serial values; formatting, styles, formulas, merged cells, and charts are not reproduced by text extraction. DOCX/PPTX extraction is plain text and does not preserve document layout. Generated documents are basic structured reports, rather than complex Office document authoring.

File copy, move, rename, deletion, and backup tools handle one ordinary file at a time within the configured read-size limit. Directories can be created and browsed; recursive directory moves/copies/deletes are refused. `filesystem_organize` takes up to 50 explicit source/destination mappings, validates them first, and attempts rollback on failure. Existing sources are backed up before removal. Backups stay in the protected `.state/backups` store. `filesystem_restore` accepts a direct UUID `.bak` file from that store, validates its location, and confirms before restoration.

Dry run is the default for all filesystem writes. `filesystem_edit` requires `expectedSha256` from a current `filesystem_read`; replacement, move, rename, recycle, organization, and restoration additionally require host approval and a separate Windows confirmation. A source changed during approval is rejected. File deletion uses the Windows Recycle Bin and never falls back to permanent deletion.

The automated fixtures round-trip generated PDF, DOCX, XLSX, and PPTX text and exercise all nine report formats. They validate document structure/content, rather than guaranteeing pixel-identical rendering in every Office version. Reading the above format limitations is part of interpreting those test results.

## Large-file limit

The configured file limit is 2 GiB (2,147,483,648 bytes), inclusive, per file. File hashes, copy/move previews, comparisons, backups and restores avoid whole-file memory buffers. Ordinary UTF-8 file reads scan the source in chunks and return at most 2,500,000 characters with `truncated: true` when necessary. Full-file SHA-256 covers all bytes. Comparisons of large text still return full-file hashes/equality; line-level differences are omitted with `textComparisonTruncated: true` when the text budget is exceeded.

This setting is not a 2 GiB MCP response or upload allowance. Office/PDF and academic structured extractors still use in-memory libraries and their existing decompression, segment, image and output bounds; the file ceiling does not guarantee that a 2 GiB document can be parsed. The 90-second tool timeout and all authorization/approval boundaries remain unchanged.

Large media-rich DOCX files use the same bounded Office reader for filesystem text extraction, academic extraction, style analysis, quality checks, patch preparation and deliverable inspection. Individual image forwarding and text/segment response limits remain separate. Package sizes are inspected from ZIP metadata; unrequested media is never represented as decoded pixels or inspected content.

The total extracted-text budget is now 2,500,000 UTF-16 code units (10 times the previous 250,000), shared by filesystem reads/comparisons and academic extraction. Existing 20,000-character per-segment, 2,500-segment, page/slide/cell/line and image bounds remain unchanged. Canonical extraction identity is versioned: previous shorter indexes are treated as stale, and academic_index_build must refresh them before search/citation reuse. Historical tasks/checkpoints are retained and may require source review. This does not change the host model context or its tool-output truncation limits.
