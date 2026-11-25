# Media-rich Office document reading

The previous readers counted all expanded embedded media against a 40 MiB text budget. This rejected the authorized DSA.docx even though its XML is only about 1.7 MB. All Office-reading paths now share the same reader.

- `maxOfficeArchiveBytes`: 2,147,483,648 bytes of declared expanded package data, including media.
- `maxOfficeXmlBytes`: 41,943,040 bytes of actual inflated XML/relationship data. Configurable up to 256 MiB.
- 5,000 ZIP entry cap, DTD/entity/malformed XML rejection, XML inflation byte checks and cancellation remain enforced.
- Text extraction and quality/style analysis do not inflate embedded media. Individual image tools retain their own bounds.
- Ordinary DOCX text reads use validated main-document XML directly, without a second media-capable package parser.

33 focused tests passed, including a 48 MiB embedded-media fixture, rejection under a lower custom package budget, XML-size protection with falsified ZIP metadata, source preservation, entity rejection and cancellation. Fresh STDIO calls against the actual authorized 113,846,213-byte DSA.docx passed filesystem_read, academic_document_extract, academic_style_analyse and academic_document_quality. Source SHA-256 and modification time remained unchanged. See OFFICE-ARCHIVE-DSA-VERIFICATION.json for results.

The document exceeds the existing 250,000-character response budget. Filesystem text is returned with truncated=true and structured extraction reports its limit warning. The verification does not claim every paragraph/image was returned or visually inspected. Quality results still require visual and academic review.

Reconnect the MCP server or fully quit/reopen Codex to load the new build/config. No personal assignment content or global Codex configuration was modified.

Additional extraction checks: 8 passed (PDF, DOCX, image bounds, PPTX, XLSX and source/unsafe-XML handling); the OCR test remains blocked by the previously documented Windows PowerShell execution policy. No execution policy was changed.
