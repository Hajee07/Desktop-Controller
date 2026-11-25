# Live Word COM null handling repair

## Reproduced cause

On 2026-11-17, the connected MCP's `word_get_paragraphs` reproduced
`Cannot perform runtime binding on a null reference` on the active PACP assignment.
A read-only COM probe located paragraph 3: `Range.Style` was null while
`Paragraph.Style.NameLocal` correctly returned `TOC 1`.
The document was already unsaved; no edit or save was performed on it.

Paragraph formatting now comes from `Paragraph.Style`, falling back to the range
only when paragraph style metadata is absent. This uses Word's native paragraph
style rather than a potentially mixed character range. Microsoft documents the
[Range.Style property](https://learn.microsoft.com/en-us/office/vba/api/word.range.style).

## Changes

- All paragraph reads, headings and section reads share `WordParagraph`.
- Null text and absent optional style/list metadata no longer crash reads.
  `styleAvailable` and `numberingAvailable` distinguish unavailable metadata from
  known formatting; no Normal style or list label is invented.
- Required document, window, range, collection, selection, table/cell, image,
  font, paragraph-format, header/footer, bibliography/source/field and UndoRecord
  objects are checked before chained access in the Word adapter.
- A missing required object returns `WORD_OBJECT_UNAVAILABLE` with the component
  name. Null/empty live XML returns `WORD_XML_UNAVAILABLE`; it cannot silently
  produce an empty checkpoint/revision. These errors are not permission grants.
- Existing COM failures still propagate. Revision guards, checkpoints, backups,
  approvals and transactional edit behavior remain in force. No edit retries
  were added.
- The deployed helper binary was backed up under `backups/word-null-fix-*`.
  Only the idle native helper was restarted; Word and the MCP server stayed open.

## Validation

- `npm run build`: TypeScript/native helper build succeeded with no warnings.
- `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/word-native-null.test.ts tests/word-trust.test.ts`:
  native test plus two backup/trust boundary tests passed. The native executable
  exercises 16 regression scenarios, including the TOC null style, string style,
  character-style distinction, missing text/numbering, unavailable required
  objects, empty XML and genuine COM error propagation.
- Connected MCP, original assignment, read-only: first 100 paragraphs succeeded;
  paragraph 3 reported `TOC 1`; its exact section, first table and current
  selection also read successfully.
- `node scripts/word-null-smoke.mjs`: 13 real native fixture checks passed:
  paragraphs, headings, tables, selection, empty bibliography, section,
  checkpoint, replace/table/image batch, live readback, stale-revision rejection,
  unchanged disk original before save, persisted DOCX verification, and original
  disk backup. Only the generated fixture was edited/saved/closed; Word was not
  quit. Results are in `test-results/word-null-live-*/verification.json`.

## Remaining observed limitation

Reading the complete outline of the 3,195-paragraph assignment timed out. This
is separate from the reproduced null-style defect. Full-outline performance on
that document is **not** claimed as fixed. Small-fixture outline retrieval passed.
Use paginated paragraphs and bounded section reads for large documents.
This repair covers Word COM null handling, not every possible error in every
application or every Word document state.
