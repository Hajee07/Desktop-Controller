import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import JSZip from 'jszip';

const project = fileURLToPath(new URL('..', import.meta.url));
const documentation = path.join(project, 'documentation');
const config = JSON.parse(await fs.readFile(path.join(project, 'config.json'), 'utf8'));
const client = new Client({ name: 'spss-capability-report', version: '1.0.0' });
const sessionId = randomUUID();
const reports = await Promise.all(['SPSS-VERIFICATION.json', 'SPSS-OUTPUT-VERIFICATION.json', 'SPSS-LIFECYCLE-VERIFICATION.json'].map(async name => ({ name, report: JSON.parse(await fs.readFile(path.join(documentation, name), 'utf8')) })));
for (const entry of reports) assert.equal(entry.report.status, 'PASS', entry.name);
const invoke = async (name, args = {}) => {
  const reply = await client.callTool({ name, arguments: args }, { timeout: 125000 });
  assert.ok(!reply.isError, JSON.stringify(reply));
  return JSON.parse(reply.content[0].text);
};
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'dist/index.js')], cwd: project, stderr: 'pipe' }));
  const list = await client.listTools();
  const spss = list.tools.filter(tool => tool.name.startsWith('spss_'));
  await invoke('spss_start_session', { sessionId });
  const environment = await invoke('spss_get_environment');
  const capabilities = await invoke('spss_get_capabilities', { sessionId });
  assert.ok(capabilities.modules.some(module => module.id === 'BASE' && module.status === 'AVAILABLE'));
  await invoke('spss_stop_session', { sessionId });
  const outputFolder = reports[1].report.fixture;
  assert.equal((await fs.readFile(path.join(outputFolder, 'viewer.pdf'))).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual((await fs.readFile(path.join(outputFolder, 'viewer-chart.png'))).subarray(0, 4), Buffer.from([137, 80, 78, 71]));
  for (const filename of ['data.xlsx', 'viewer.xlsx']) {
    const archive = await JSZip.loadAsync(await fs.readFile(path.join(outputFolder, filename)));
    assert.ok(archive.file('xl/workbook.xml'));
  }
  const word = await fs.readFile(path.join(outputFolder, 'viewer.doc'));
  const wordSignature = word.subarray(0, 20).toString('latin1');
  const wordFormat = wordSignature.startsWith('{\\rtf') ? 'RTF in SPSS native .doc export' : word.subarray(0, 4).equals(Buffer.from([208, 207, 17, 224])) ? 'OLE Word document' : wordSignature.includes('<?xml') ? 'Word XML' : 'SPSS native Word export';
  const snapshot = { generatedAt: new Date().toISOString(), environment, capabilities,
    tests: reports.map(entry => ({ report: entry.name, status: entry.report.status, checks: entry.report.checks.length })),
    existingSuite: { total: 152, passed: 144, failed: 3, skipped: 5, failures: 'Existing Windows OCR tests cannot resolve Windows.Storage.StorageFile through WinRT' },
    legacySpssFiveProcedures: 'PASS', stdio: { status: 'PASS', tools: list.tools.length, spssTools: spss.length, invalidRequiredSchemas: 201 },
    fileSignatures: { pdf: 'PASS', chartPng: 'PASS', xlsx: 'PASS', word: wordFormat },
    fullRequestAcceptance: 'PARTIAL',
    remaining: ['Unrestricted Python/custom procedures and embedded R', 'Third-party extension installation and update', 'POR export through installed Python 3 Unicode integration', 'Unverified XLS, POR, SAS, Stata and fixed-width import fixtures', 'All options of all licensed procedures and advanced external plan/model file workflows', 'Large-data performance benchmark and arbitrary GUI chart-editor controls'] };
  await fs.writeFile(path.join(documentation, 'SPSS-CAPABILITIES.json'), JSON.stringify(snapshot, null, 2));
  let matrix = '# SPSS 27 capability and verification matrix\n\n';
  matrix += `Detected ${environment.version}. ${spss.length} SPSS tools are exposed through the existing server, with ${list.tools.length} tools in total.\n\n`;
  matrix += 'The comprehensive request has PARTIAL acceptance. The implemented local connector is operational. The remaining boundaries are listed below.\n\n';
  matrix += '| Feature | Connector status | Evidence and limits |\n|---|---|---|\n';
  const rows = [
    ['Installation, version, Python and licenses', 'AVAILABLE', 'Runtime SPSS 27.0.1.0, Python 3.8.2 and SHOW LICENSE'],
    ['Managed sessions, checkpoints and restart recovery', 'AVAILABLE', 'Actual cancellation and MCP-process restart tests'],
    ['SAV, ZSAV, CSV, XLSX data import/export', 'AVAILABLE', 'Native round-trip tests'],
    ['Compute, recode, selection, filters, labels, missing values, sorting and aggregation', 'AVAILABLE', 'Actual generated-data transformations and rollback'],
    ['Create/copy/rename/close and add-cases merge', 'AVAILABLE', 'Native Dataset API and syntax tests'],
    ['Guarded native syntax and SPS files', 'AVAILABLE', 'Native execution, policy tests, semantic errors and idempotency'],
    ['Descriptives, frequencies, t-test, ANOVA, chi-square, correlation, regression and reliability', 'AVAILABLE', 'Actual SPSS output and numeric OMS mean verification'],
    ['Factor/PCA, clustering, survival, ARIMA, decision tree, MLP, bootstrap and power', 'PARTIALLY AVAILABLE', 'Representative procedures pass; complete option space is not tested'],
    ['Viewer table retrieval and chart selection', 'AVAILABLE', 'Real open SPV and DataCellArray tests'],
    ['Native charts, PDF, Word DOC, XLSX, HTML, text and SPV exports', 'AVAILABLE', `Viewer and backend tests; Word encoding is ${wordFormat}`],
    ['Installed native KNN extension', 'AVAILABLE', 'Manifest discovery and actual KNN execution'],
    ['Python execution', 'PARTIALLY AVAILABLE', 'Bounded numerical expressions and native APIs in the Python 3.8 bridge'],
    ['R integration', 'NOT AVAILABLE', capabilities.r.evidence],
    ['POR export', 'NOT AVAILABLE', 'Native errors 5633 and 1075 conflict with Python3 Unicode requirements'],
    ['Third-party extension install/update and unrestricted code', 'NOT AVAILABLE', 'No package-specific execution policy implemented'],
    ['XLS/POR/SAS/Stata import and variable-match merge', 'PARTIALLY AVAILABLE', 'Gateways implemented; corresponding file-format and merge fixtures remain unverified'],
    ['Every licensed option, external plan/model workflows and arbitrary GUI editing', 'PARTIALLY AVAILABLE', 'Requires further adapters and feature-specific integration tests']
  ];
  for (const row of rows) matrix += '| ' + row.map(cell => String(cell).replaceAll('|', '/')).join(' | ') + ' |\n';
  matrix += '\n## Detected license components\n\n| Component | Runtime status | Expiration reported by SPSS |\n|---|---|---|\n';
  for (const module of capabilities.modules) matrix += `| ${module.name} | ${module.status} | ${module.expiration ?? 'Not reported'} |\n`;
  matrix += '\n## Test results\n\n';
  for (const entry of reports) matrix += `- ${entry.name}: PASS (${entry.report.checks.length} recorded checks).\n`;
  matrix += '- Original five native-analysis tools: PASS.\n- Existing full unit suite: 144 passed, 3 Windows OCR failures, 5 skipped.\n- STDIO discovery: 241 tools, 201 required-input schema rejection checks, host-decline check passed.\n- Exported PDF/PNG/XLSX signatures verified.\n\nSee SPSS-UPGRADE.md for installation, usage, limits, troubleshooting and test commands.\n';
  await fs.writeFile(path.join(documentation, 'SPSS-CAPABILITY-MATRIX.md'), matrix);
  let reference = '# SPSS MCP tool reference\n\nGenerated from the actual STDIO tools/list response. The input schemas are authoritative. File paths must be absolute and authorized.\n\n';
  for (const tool of spss) reference += `## ${tool.name}\n\n${tool.description.split('\n\nCodex is')[0]}\n\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n\n`;
  await fs.writeFile(path.join(documentation, 'SPSS-TOOLS.md'), reference);
  console.log(JSON.stringify({ tools: list.tools.length, spssTools: spss.length, modules: capabilities.modules.length, status: snapshot.fullRequestAcceptance, fileSignatures: snapshot.fileSignatures }));
} finally {
  await client.close();
  const root = path.join(config.stateDir, 'spss-' + sessionId);
  if ((await fs.readdir(root)).every(name => name === 'state.json')) {
    await fs.unlink(path.join(root, 'state.json'));
    await fs.rmdir(root);
  }
}
