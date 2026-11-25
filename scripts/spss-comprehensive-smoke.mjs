import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const project = fileURLToPath(new URL('..', import.meta.url));
const base = path.join(project, 'test-results');
await fs.mkdir(base, { recursive: true });
const resumeId = process.argv[2];
if (resumeId && !/^[a-f0-9-]{36}$/.test(resumeId)) throw new Error('Invalid test session ID');
const config = JSON.parse(await fs.readFile(path.join(project, 'config.json'), 'utf8'));
const sessionId = resumeId ?? randomUUID();
const stateRoot = path.join(config.stateDir, 'spss-' + sessionId);
const savedState = resumeId ? JSON.parse(await fs.readFile(path.join(stateRoot, 'state.json'), 'utf8')) : null;
const folder = resumeId ? path.dirname(savedState.datasets.Survey.source) : await fs.mkdtemp(path.join(base, 'spss-comprehensive-'));
config.authorizedRoots = [folder];
config.toolTimeoutMs = 110000;
const dataset = path.join(folder, "generated survey's data.sav");
const python = path.join(path.dirname(config.applications.spss.executable), 'Python3', 'python.exe');
const fixture = String.raw`import spss, sys
rows = ['%s %s %s %s %s %s' % (i, i % 7 + i / 10, i * 2 + i % 5, i % 2, (i % 3) > 0, i + 1) for i in range(1, 61)]
rows = [r.replace('True', '1').replace('False', '0') for r in rows]
spss.Submit(['DATA LIST FREE / x z y grp event time.', 'BEGIN DATA\n' + '\n'.join(rows) + '\nEND DATA.', "SAVE OUTFILE='" + sys.argv[1].replace(chr(92), '/').replace("'", "''") + "'."])
spss.StopSPSS()`;
const client = new Client({ name: 'spss-comprehensive-acceptance', version: '1.0.0' });
const report = resumeId ? JSON.parse(await fs.readFile(path.join(project, 'documentation', 'SPSS-VERIFICATION.json'), 'utf8')) : { date: new Date().toISOString(), scope: 'Generated data over the actual STDIO MCP entry point and IBM SPSS 27 backend', checks: [], capabilities: null, toolCount: 0 };
report.sessionId = sessionId;
const record = (name, details = {}) => { report.checks.push({ name, status: 'PASS', ...details }); console.log('PASS ' + name); };
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, { timeout: 125000 });
  if (result.isError) throw new Error(name + ': ' + result.content[0].text);
  return JSON.parse(result.content[0].text);
}
async function rejects(name, args, pattern) {
  await assert.rejects(call(name, args), pattern);
}
let revision = 0;
async function execute(name, syntax, formats = []) {
  const args = { sessionId, dataset: 'Survey', syntax, expectedRevision: revision, requestKey: randomUUID(), formats, dryRun: false };
  const result = await call(name, args);
  revision = result.revision;
  assert.equal(result.status, 'COMPLETED');
  record(name, { syntax, executionId: result.executionId });
  return { result, args };
}

try {
  if (!resumeId) execFileSync(python, ['-I', '-c', fixture, dataset], { timeout: 60000 });
  const originalHash = createHash('sha256').update(await fs.readFile(dataset)).digest('hex');
  const configPath = path.join(folder, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config));
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'dist/index.js')], cwd: project, env: { ...process.env, WINDOWS_MCP_CONFIG: configPath }, stderr: 'pipe' }));
  const listed = await client.listTools();
  report.toolCount = listed.tools.length;
  assert.ok(listed.tools.some(tool => tool.name === 'spss_execute_syntax'));
  record('STDIO discovery');
  const environment = await call('spss_get_environment');
  assert.match(environment.version, /^27\./);
  record('SPSS 27 environment', environment);
  const session = await call('spss_start_session', { sessionId });
  revision = session.revision;
  assert.equal(session.backendReady, true);
  record('Persistent backend start');
  const version = await call('spss_get_version', { sessionId });
  assert.match(version.pythonVersion, /^3\.8\./);
  report.capabilities = await call('spss_get_capabilities', { sessionId });
  assert.ok(report.capabilities.modules.some(module => module.id === 'BASE' && module.status === 'AVAILABLE'));
  record('Native module/license discovery');
  if (!resumeId) {
  const opened = await call('spss_open_dataset', { sessionId, path: dataset, dataset: 'Survey', dryRun: false });
  revision = opened.revision;
  assert.equal(opened.caseCount, 60);
  record('Open native SAV');
  assert.equal((await call('spss_get_variable_dictionary', { sessionId, limit: 2 })).variables.length, 2);
  assert.equal((await call('spss_preview_data', { sessionId, offset: 1, limit: 2 })).rows[0][0], 2);
  record('Dictionary and data pagination');
  for (const unsafe of ["HOST COMMAND=['whoami'].", 'BEGIN PROGRAM Python3.\nprint(1)\nEND PROGRAM.', "GET FILE='C:/outside.sav'.", "COMPUTE x=!macro.", "REGRESSION /MATRIX=IN('C:/outside.sav')."]) {
    await rejects('spss_validate_syntax', { syntax: unsafe }, /RESTRICTED|NOT_ALLOWED|INCOMPLETE/);
  }
  await rejects('spss_open_dataset', { sessionId, path: path.join(project, 'outside.sav'), dataset: 'Other', dryRun: false }, /PATH_DENIED/);
  record('Syntax and filesystem restrictions');
  const description = await execute('spss_run_analysis', 'DESCRIPTIVES VARIABLES=x y.', ['pdf', 'xlsx', 'html', 'text']);
  const output = await call('spss_get_output', { sessionId, executionId: description.result.executionId });
  assert.ok(output.items.some(item => item.text === 'Descriptive Statistics'));
  assert.ok(output.items.flatMap(item => item.cells).some(cell => Number(cell.number) === 30.5));
  record('Actual numeric OMS mean 30.5');
  assert.equal((await call('spss_execute_syntax', description.args)).replayed, true);
  record('Idempotent execution replay');
  for (const format of ['spv', 'xml', 'pdf', 'xlsx', 'html', 'text', 'sps']) {
    const filename = path.join(folder, 'native-output.' + format);
    const exported = await call('spss_export_output', { sessionId, executionId: description.result.executionId, format, path: filename, dryRun: false });
    assert.ok(exported.bytes > 0);
    record('Native output export ' + format);
  }
  }
  let resumeReached = !resumeId;
  for (const [tool, nativeSyntax] of [
    ['spss_run_statistical_test', 'T-TEST GROUPS=grp(0 1) /VARIABLES=y.'],
    ['spss_run_anova', 'ONEWAY y BY grp /STATISTICS DESCRIPTIVES HOMOGENEITY.'],
    ['spss_run_statistical_test', 'CROSSTABS /TABLES=grp BY event /STATISTICS=CHISQ.'],
    ['spss_run_correlation', 'CORRELATIONS /VARIABLES=x z y.'],
    ['spss_run_regression', 'REGRESSION /DEPENDENT y /METHOD=ENTER x z.'],
    ['spss_run_factor_analysis', 'FACTOR /VARIABLES x z y /EXTRACTION=PC.'],
    ['spss_run_cluster_analysis', 'QUICK CLUSTER x z y /CRITERIA=CLUSTER(2).'],
    ['spss_run_survival_analysis', 'KM time /STATUS=event(1).'],
    ['spss_run_forecasting', 'ARIMA y /MODEL=(1,0,0) /MXITER=5.'],
    ['spss_run_decision_tree', 'TREE grp [N] BY x [S] z [S] /METHOD TYPE=CHAID /TREE DISPLAY=NONE.'],
    ['spss_run_neural_network', 'MLP y WITH x z /PLOT NONE.'],
    ['spss_run_bootstrap', 'BOOTSTRAP /SAMPLING METHOD=SIMPLE /CRITERIA NSAMPLES=100.\nCORRELATIONS /VARIABLES=x y.'],
    ['spss_run_power_analysis', 'POWER MEANS ONESAMPLE /PARAMETERS N=30 SD=1 MEAN=0.3 NULL=0.'],
    ['spss_create_chart', 'GRAPH /HISTOGRAM(NORMAL)=y.'],
    ['spss_compute_variable', 'COMPUTE doubled=x*2.\nEXECUTE.'],
    ['spss_manage_value_labels', "VALUE LABELS grp 0 'Group A' 1 'Group B'."],
    ['spss_manage_missing_values', 'MISSING VALUES doubled (-999).'],
    ['spss_sort_cases', 'SORT CASES BY x (D).']
  ]) {
    if (tool === 'spss_compute_variable') resumeReached = true;
    if (resumeReached) await execute(tool, nativeSyntax);
  }
  assert.equal((await call('spss_execute_python', { sessionId, expression: 'case_count() + sum([1,2,3])' })).result, 66);
  await rejects('spss_execute_python', { sessionId, expression: "__import__('os').getcwd()" }, /PYTHON_/);
  record('Bounded bundled Python integration');
  const saved = path.join(folder, 'working-copy.sav');
  await call('spss_save_dataset', { sessionId, dataset: 'Survey', path: saved, dryRun: false });
  record('Save working copy');
  await rejects('spss_save_dataset', { sessionId, dataset: 'Survey', path: dataset, dryRun: false }, /OUTPUT_EXISTS/);
  await rejects('spss_execute_syntax', { sessionId, dataset: 'Survey', syntax: 'COMPUTE x=0.', expectedRevision: 0, requestKey: randomUUID(), dryRun: false }, /STALE_REVISION/);
  record('Original overwrite and stale revision guards');
  await rejects('spss_execute_syntax', { sessionId, dataset: 'Survey', syntax: 'COMPUTE x=0.\nDESCRIPTIVES VARIABLES=missing_variable.', expectedRevision: revision, requestKey: randomUUID(), dryRun: false }, /error|Error|SPSS_/);
  const recovered = await call('spss_preview_data', { sessionId, limit: 1 });
  assert.equal(recovered.rows[0][0], 60);
  record('Failed mutation rollback');
  await call('spss_stop_session', { sessionId });
  const restarted = await call('spss_start_session', { sessionId });
  assert.equal(restarted.active, 'Survey');
  assert.equal((await call('spss_preview_data', { sessionId, limit: 1 })).rows[0][0], 60);
  record('Restart checkpoint recovery');
  assert.equal((await call('spss_get_dataset_metadata', { sessionId, limit: 2 })).variables.length, 2);
  const created = await call('spss_create_dataset', { sessionId, dataset: 'Created', variables: [{ name: 'id' }], rows: [[1], [2]], dryRun: false });
  assert.equal(created.caseCount, 2);
  const copied = await call('spss_copy_dataset', { sessionId, dataset: 'Created', name: 'Copy', dryRun: false });
  assert.equal(copied.caseCount, 2);
  const renamed = await call('spss_rename_dataset', { sessionId, dataset: 'Copy', name: 'Renamed', dryRun: false });
  assert.equal(renamed.dataset, 'Renamed');
  const merged = await call('spss_merge_datasets', { sessionId, dataset: 'Created', otherDataset: 'Renamed', mode: 'add_cases', expectedRevision: renamed.revision, requestKey: randomUUID(), dryRun: false });
  assert.equal(merged.status, 'COMPLETED');
  assert.equal((await call('spss_get_dataset_metadata', { sessionId, dataset: 'Created' })).caseCount, 4);
  await call('spss_close_dataset', { sessionId, dataset: 'Renamed' });
  record('Create, copy, rename, merge and close datasets');
  assert.equal(createHash('sha256').update(await fs.readFile(dataset)).digest('hex'), originalHash);
  record('Original dataset hash preserved');
  await call('spss_stop_session', { sessionId });
  report.status = 'PASS';
  delete report.error;
} catch (error) {
  report.status = 'FAIL'; report.error = error.message;
  throw error;
} finally {
  await fs.writeFile(path.join(project, 'documentation', 'SPSS-VERIFICATION.json'), JSON.stringify(report, null, 2));
  await client.close();
  // Retain owned fixture and checkpoints on failure for diagnosis.
  if (report.status === 'PASS') {
    assert.equal(path.dirname(await fs.realpath(folder)).toLowerCase(), base.toLowerCase());
    assert.equal(path.dirname(await fs.realpath(stateRoot)).toLowerCase(), config.stateDir.toLowerCase());
    await fs.rm(folder, { recursive: true, force: true });
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
}
