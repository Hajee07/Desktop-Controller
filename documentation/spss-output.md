# IBM SPSS output integration

The server uses the bundled IBM SPSS Statistics 27 Python and `SpssClient` to open an authorized `.spv` file in a real Viewer. It does not parse or fabricate screenshots.

1. Call `spss_output_open` with an absolute `.spv` path under an authorized root. Check `filename`, `path`, `title`, and `verifiedVisible` in the response.
2. Call `spss_output_list` to find the actual output object index and description.
3. Call `spss_output_select` with that index. Check `current` and `selected` before taking a screenshot.
4. Use `window_list` for the Viewer window handle and process ID, then `desktop_screenshot` for a genuine application capture under an authorized output directory. The usual unlocked-desktop, presence, secure-field, host approval, and local confirmation checks remain in force.
5. `spss_output_values` reads the native pivot-table `DataCellArray()` with row/column pagination. This replaces the previous HTML fallback, which could produce an empty table. Native OMS XML also exposes numeric attributes, coordinates, and footnotes for new backend executions.

The Viewer worker stays connected during the MCP process lifetime and exits when its STDIO closes. Restart Codex Desktop to load newly added tools.

## Run an analysis

1. Use `spss_dataset_inspect` with an authorized `.sav` or `.zsav` path. It returns the variable dictionary and case count, with pagination for large dictionaries.
2. Use `spss_analysis_run` with the dataset `path`, a `procedure`, `variables`, and a new `.spv` `outputPath` in an authorized folder. The default is a preview. Set `dryRun` to `false` to run the analysis. For regression, also specify the separate outcome variable as `dependent`.
3. Open the result with `spss_output_open`. Review the SPSS output tables and warnings before drawing conclusions.

The original fixed-analysis tools retain descriptives, frequencies, Pearson correlation, Cronbach's alpha, and enter-method regression. The persistent connector additionally exposes guarded native syntax, named statistical gateways, import/export, transformations, checkpoints, structured OMS output, native reports and charts. See [the SPSS connector guide](SPSS-UPGRADE.md) and the generated capability/test reports for exact coverage.

The MCP approval flow returns `APPROVAL_DENIED` for an explicit decline/cancel, `APPROVAL_RESPONSE_INVALID` for malformed accepted content, and `APPROVAL_UNSUPPORTED` when a retried request has no response. A client with no form elicitation capability can also return the SDK's distinct "Cannot request input ... required capability" error before retry. No protected operation executes in any of these cases.
