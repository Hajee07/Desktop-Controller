# Native Word references

Use `word_get_references` with the authorized open document's `documentId` and `path` to read the current bibliography style, document sources and main-body citation fields. Use a fresh `word_get_paragraphs` or `word_get_selection` result to locate the insertion point and capture the revision. All citation and bibliography insertion ranges must be collapsed (`start === end`).

`word_edit_batch` accepts these operations in addition to the existing edits:

- `citation` inserts a native Word citation. Supply `tag` and structured `source` metadata to add a new source as part of the same edit. For an existing tag, omit `source`. Use `pages` to add a citation locator.
- `reference-source` adds a structured source to the document's current list. Use `citation` instead when adding and citing the source in one step.
- `bibliography` inserts a native bibliography. The batch refreshes it after all edits so it can include citations inserted earlier in document order.
- `bibliography-refresh` updates main-body citation and bibliography fields using the document's current Word style.

The accepted source types are `Book`, `JournalArticle`, `InternetSite`, and `Report`. Supply the actual title and either `authors` (an array of `last` and optional `first` names) or `corporateAuthor`. Use the known publication year and relevant journal, publisher, URL or other supported metadata. An existing tag cannot be silently replaced. The document's current Word citation style controls rendering. The shared Word master source list and Word's Add New Placeholder command have no write adapter here.

Review the batch preview and apply with `dryRun: false` and a unique `requestKey`. Re-read the document and references to verify the result. Save explicitly with `word_save_document` and the fresh revision. Existing folder permissions, checkpoints and save backups apply.

Restart or reconnect the MCP after rebuilding. Run `node scripts/word-references-smoke.mjs` to verify live Word behavior on a generated document in `workspace`.
