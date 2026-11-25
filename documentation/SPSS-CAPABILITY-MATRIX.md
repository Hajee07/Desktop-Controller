# SPSS 27 capability and verification matrix

Detected 27.0.1.0. 78 SPSS tools are exposed through the existing server, with 241 tools in total.

The comprehensive request has PARTIAL acceptance. The implemented local connector is operational. The remaining boundaries are listed below.

| Feature | Connector status | Evidence and limits |
|---|---|---|
| Installation, version, Python and licenses | AVAILABLE | Runtime SPSS 27.0.1.0, Python 3.8.2 and SHOW LICENSE |
| Managed sessions, checkpoints and restart recovery | AVAILABLE | Actual cancellation and MCP-process restart tests |
| SAV, ZSAV, CSV, XLSX data import/export | AVAILABLE | Native round-trip tests |
| Compute, recode, selection, filters, labels, missing values, sorting and aggregation | AVAILABLE | Actual generated-data transformations and rollback |
| Create/copy/rename/close and add-cases merge | AVAILABLE | Native Dataset API and syntax tests |
| Guarded native syntax and SPS files | AVAILABLE | Native execution, policy tests, semantic errors and idempotency |
| Descriptives, frequencies, t-test, ANOVA, chi-square, correlation, regression and reliability | AVAILABLE | Actual SPSS output and numeric OMS mean verification |
| Factor/PCA, clustering, survival, ARIMA, decision tree, MLP, bootstrap and power | PARTIALLY AVAILABLE | Representative procedures pass; complete option space is not tested |
| Viewer table retrieval and chart selection | AVAILABLE | Real open SPV and DataCellArray tests |
| Native charts, PDF, Word DOC, XLSX, HTML, text and SPV exports | AVAILABLE | Viewer and backend tests; Word encoding is RTF in SPSS native .doc export |
| Installed native KNN extension | AVAILABLE | Manifest discovery and actual KNN execution |
| Python execution | PARTIALLY AVAILABLE | Bounded numerical expressions and native APIs in the Python 3.8 bridge |
| R integration | NOT AVAILABLE | Checked standard local R and SPSS R installation directories. A live SPSS R execution bridge has not been verified. |
| POR export | NOT AVAILABLE | Native errors 5633 and 1075 conflict with Python3 Unicode requirements |
| Third-party extension install/update and unrestricted code | NOT AVAILABLE | No package-specific execution policy implemented |
| XLS/POR/SAS/Stata import and variable-match merge | PARTIALLY AVAILABLE | Gateways implemented; corresponding file-format and merge fixtures remain unverified |
| Every licensed option, external plan/model workflows and arbitrary GUI editing | PARTIALLY AVAILABLE | Requires further adapters and feature-specific integration tests |

## Detected license components

| Component | Runtime status | Expiration reported by SPSS |
|---|---|---|
| IBM SPSS Statistics Base | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Regression | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Advanced Statistics | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Forecasting | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Decision Trees | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Neural Networks | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Bootstrapping | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Complex Samples | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Missing Values | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Categories | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Custom Tables | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Exact Tests | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Conjoint | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Data Preparation | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Direct Marketing | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Statistics | AVAILABLE | 2037-12-31T00:00:00 |
| Tables Original | AVAILABLE | 2037-12-31T00:00:00 |
| Trends Original | AVAILABLE | 2037-12-31T00:00:00 |
| IBM SPSS Statistics Adapter | AVAILABLE | 2037-12-31T00:00:00 |

## Test results

- SPSS-VERIFICATION.json: PASS (54 recorded checks).
- SPSS-OUTPUT-VERIFICATION.json: PASS (27 recorded checks).
- SPSS-LIFECYCLE-VERIFICATION.json: PASS (18 recorded checks).
- Original five native-analysis tools: PASS.
- Existing full unit suite: 144 passed, 3 Windows OCR failures, 5 skipped.
- STDIO discovery: 241 tools, 201 required-input schema rejection checks, host-decline check passed.
- Exported PDF/PNG/XLSX signatures verified.

See SPSS-UPGRADE.md for installation, usage, limits, troubleshooting and test commands.
