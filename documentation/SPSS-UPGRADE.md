# SPSS 27 connector upgrade

## Audit and implementation plan

The existing TypeScript MCP uses local STDIO, Zod schemas, a central tool registry, redacted SQLite audit logs, authorized path checks, storage reservations, and host plus local confirmation for protected operations. Six SPSS tools currently cover five fixed analyses and Viewer navigation. The analysis process is short lived, the Python path is fixed, and table text relies on an HTML export that can be empty.

The upgrade preserves these tools. A dedicated Python 3.8 bridge will own an isolated SPSS backend, serialize requests, checkpoint datasets, capture OMS XML and SPV, and return actual results. TypeScript will enforce paths and syntax policy before dispatch. The installed command XML and license APIs will drive discovery. Viewer integration will remain separate from backend sessions.

Implementation sequence:

1. Discover installation, exact version, Python, command definitions, modules, extensions, and scripting API.
2. Add persistent backend sessions with timeout, cancellation, checkpoints, and explicit recovery.
3. Add controlled syntax, dataset operations, import/export, transformations, and named procedure gateways.
4. Capture actual structured tables, warnings, charts, reproducible syntax, and exports.
5. Test generated data over STDIO, retain original hashes, and publish measured capability results.

The final verification report records feature-level evidence. Installed command definitions, licensed modules, successful execution, and tested wrapper support are separate facts.

## Installation and connection

This upgrade runs inside the existing `windows-laptop-control-mcp` project. No dependencies or SPSS extensions were installed. It retains the existing local STDIO registration.

Required local components are Node.js 24.15 or later, IBM SPSS Statistics 27, its bundled Python 3.8 integration, and valid licenses for the requested procedures. Installation discovery checks the configured `applications.spss.executable` directory and standard IBM version-27 locations. Both the product version file and bundled interpreter must exist. The current installation is `C:\Program Files\IBM\SPSS\Statistics\27` with version 27.0.1.0 and Python 3.8.2.

Run `npm run build` after source changes. Restart Codex Desktop or reconnect the existing MCP to load the expanded tool list. Keep the existing server configuration and authorized roots. Use `configuration_get` to inspect roots before accessing data. Add a new root through the existing local configuration process when needed.

For GUI Viewer tools, start SPSS with `application_open` using `appId: "spss"`. A running GUI is required for a reliable `SpssClient` attachment in this installation. The statistical backend tools operate in their own session. They do not inspect unsaved GUI Data Editor buffers.

## Persistent workflow

1. Call `spss_start_session`. Retain its `sessionId`.
2. Call `spss_open_dataset` with a new dataset name, an authorized absolute file path, and `dryRun: false` after reviewing the preview.
3. Inspect `spss_get_variable_dictionary`, `spss_get_dataset_metadata`, or `spss_preview_data`.
4. Obtain the current revision. Submit native syntax through `spss_execute_syntax` or the relevant named gateway. Include the session ID, dataset name, `expectedRevision`, a unique UUID `requestKey`, and `dryRun: false`.
5. Inspect the actual returned OMS output and any warnings. Use `spss_get_output` for pagination.
6. Use `spss_export_output` to save the execution's SPV, XML, syntax, or a requested report format into an authorized folder. Specify `formats: ["pdf", "xlsx", "html", "text"]` on execution for those native exports.
7. Save transformed data to a new path with `spss_save_dataset`. Use `spss_output_open` to inspect an exported SPV in the actual Viewer.

Named gateways accept native SPSS syntax. Codex chooses the procedure, variables and assumptions. For example, `T-TEST GROUPS=grp(0 1) /VARIABLES=y.` runs an independent-samples test, and `REGRESSION /DEPENDENT y /METHOD=ENTER x z.` runs multiple linear regression. The installed 27 command definitions and native errors remain authoritative.

The original six SPSS tools remain available. Their names and default previews continue to work.

## Dataset operations

SAV, ZSAV, CSV and XLSX export/import round trips are tested. Native gateways also implement POR import, XLS import, SAS and Stata import. Those additional imports need format-specific fixtures before being called verified. Delimited text requires explicit column names/formats and supports comma, tab or semicolon separators. Fixed-width text import currently needs a dedicated format adapter.

Dataset creation, copy, rename, close, activation, add-cases merge, metadata, preview, compute, recode, case selection, filtering, sorting, labels, missing values and aggregation operate in the owned backend. Match-variable merge requires sorted key variables. Its typed gateway is implemented, while the integration test exercises add-cases merge.

Native transformation syntax additionally permits supported rank, count, string/date/math expressions, variable formats/levels/roles/attributes, multiple-response sets, weighting, split-file analysis, sampling, and restructure commands. Individual combinations are checked by SPSS at execution. A syntax definition in the installation is not a claim that every option was tested.

## Output and reports

OMS captures SPV and structured XML. Table cells include formatted text, native numeric/date attributes and row/column coordinates. This supports source-grounded extraction of sample sizes, p-values, coefficients, model summaries and confidence intervals. Results can be paginated. Very large tables report truncation at the bounded cell limit.

Native HTML chart images can be retrieved through `spss_get_chart`. The installed SPSS embeds JPEG chart images directly inside HTML. External local image assets are embedded when exporting HTML to keep the report usable. Native Viewer tools also export a selected chart as PNG and complete output documents as PDF, Word DOC, XLSX or text. The Word format is the SPSS 27 native DOC export.

## Recovery, cancellation and resource bounds

Requests against one backend serialize. Each successful mutation checkpoints the dataset into protected server state. `expectedRevision` prevents stale edits. `requestKey` binds a run to its syntax, dataset and export formats. A repeated completed key returns the saved result. A conflicting key or interrupted run requires review.

`spss_list_sessions` discovers saved sessions after an MCP restart. Recover by passing the original session ID to `spss_start_session`. `spss_get_execution_logs` reports unfinished request manifests as `REVIEW_REQUIRED`. `spss_reset_session` reloads committed checkpoints. `spss_cancel_session` bypasses the mutation queue and terminates only the owned backend process tree. Cancellation does not automatically replay work.

The configured tool deadline, emergency stop and storage quotas apply. Native result files are bounded at 64 MiB when parsed or copied by the Viewer adapter. Metadata and row retrieval use pagination. Data previews return at most 100 columns. Large-dataset behavior beyond the generated fixtures has not been benchmarked.

## Security and compatibility limits

Dataset processing stays local. Existing authorized-root, traversal, junction and sensitive-path checks apply. New output files use exclusive creation. Original datasets are read and retained. Audit logs store tool/status/timing metadata. Checkpoints, requested syntax and statistical outputs are stored separately in protected `.state` directories.

Generic syntax permits an explicit set of native statistical and transformation commands. It rejects shell commands, macros, embedded program blocks, arbitrary external file references and configuration commands. File operations go through typed gateways. `spss_validate_syntax` validates this policy and installed command names. It is not a complete semantic compiler. SPSS performs semantic validation against the active dataset.

`spss_execute_python` currently supports bounded numerical expressions and selected native count functions. Arbitrary Python programs, custom Python procedures, embedded R programs and third-party extension programs are outside the implemented execution policy. The detector checks standard R installation directories and reports missing/unverified integration. It does not install R.

The installed native KNN extension is discovered from its real extension manifest and can execute through `spss_execute_extension`. Extension Hub downloads, third-party package installation and package updates are not implemented. They require package-specific integration and explicit authorization.

POR export is unavailable through this installed Python 3 backend. Actual SPSS errors establish both constraints: `EXPORT` rejects Unicode mode (error 5633), and Python 3 requires Unicode mode (error 1075). The bundled Python 2 executable is absent. The connector reports the limitation and offers SAV/ZSAV output.

The feature matrix distinguishes licensed modules, implemented gateways, and tested procedures. Complex Samples plan-file workflows, advanced external model-file workflows, unrestricted GPL/MATRIX programming, arbitrary chart-editor changes, every forecasting/modeling option and unsaved GUI dataset access have not received complete end-to-end acceptance.

## Tests and troubleshooting

Run these from the existing project directory:

```powershell
npm run build
node scripts/spss-analysis-smoke.mjs
node scripts/spss-comprehensive-smoke.mjs
node scripts/spss-output-smoke.mjs
node scripts/spss-lifecycle-smoke.mjs
npm test
npm run test:smoke
```

The scripts generate their own datasets. Comprehensive tests verify actual numeric OMS values, procedure execution, input hashes, revision guards, request replay and rollback. Output tests verify charts, Viewer tables, document/image exports and data round trips. Lifecycle tests verify native KNN, syntax files, transformations, cancellation and an actual MCP process restart.

Verification reports are `SPSS-VERIFICATION.json`, `SPSS-OUTPUT-VERIFICATION.json`, and `SPSS-LIFECYCLE-VERIFICATION.json`. Failed owned fixtures remain in `test-results` for diagnosis. Output fixtures remain for visual inspection. Test reports explicitly describe their scope. Some existing Windows OCR tests may depend on unavailable WinRT functionality.

For `SPSS_STALE_REVISION`, re-read session metadata. For `SPSS_EXECUTION_UNCERTAIN`, inspect history/checkpoints before choosing a new request key. For `SPSS_COMMAND_ERROR`, read the returned native messages and the execution's OMS logs. For SpssClient disconnection, verify the GUI is running, reopen the intended SPV, and inspect its identity. Some legacy license-option enumeration values crash SPSS 27; the GUI adapter probes the three tested core options and uses backend `SHOW LICENSE` for the complete registry.

## Primary references

- [IBM SPSS Statistics 27 documentation](https://www.ibm.com/support/pages/ibm-spss-statistics-27-documentation)
- The installed `syntaxreference.pdf` and `syntax_xml` command definitions are the compatibility source for this exact installation.
- The installed Python `spss` and `SpssClient` modules provide the verified method names, runtime contracts and scripting constants.
