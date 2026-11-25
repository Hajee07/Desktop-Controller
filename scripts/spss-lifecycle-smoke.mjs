import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const project = fileURLToPath(new URL('..', import.meta.url));
const folder = await fs.mkdtemp(path.join(project, 'test-results', 'spss-lifecycle-'));
const config = JSON.parse(await fs.readFile(path.join(project, 'config.json'), 'utf8'));
config.authorizedRoots = [folder];
config.toolTimeoutMs = 110000;
const configuration = path.join(folder, 'config.json');
await fs.writeFile(configuration, JSON.stringify(config));
const sessionId = randomUUID();
let client;
const checks = [];
const record = (name, detail) => { checks.push({ name, status: 'PASS', detail }); console.log('PASS ' + name); };
async function connect() {
  client = new Client({ name: 'spss-lifecycle-acceptance', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'dist/index.js')], cwd: project, env: { ...process.env, WINDOWS_MCP_CONFIG: configuration }, stderr: 'pipe' }));
}
async function call(name, args = {}) {
  const reply = await client.callTool({ name, arguments: args }, { timeout: 125000 });
  if (reply.isError) throw new Error(reply.content[0].text);
  return JSON.parse(reply.content[0].text);
}
let status = 'FAIL';
try {
  await connect();
  const listed = await client.listTools();
  let invalid = 0;
  for (const tool of listed.tools.filter(tool => tool.name.startsWith('spss_'))) {
    if (tool.inputSchema.required?.length) {
      await assert.rejects(call(tool.name, { [tool.inputSchema.required[0]]: { invalid: true } }));
      invalid++;
    }
  }
  record('SPSS tool schema validation', invalid);
  await call('spss_start_session', { sessionId });
  await call('spss_get_session_status', { sessionId });
  await call('spss_list_datasets', { sessionId });
  const commands = await call('spss_list_commands', { search: 'REGRESSION', limit: 10 });
  assert.ok(commands.commands.includes('REGRESSION'));
  await call('spss_validate_syntax', { syntax: 'DESCRIPTIVES x.' });
  record('Session and command discovery gateways');
  for (const name of ['spss_get_version', 'spss_list_modules', 'spss_list_procedures', 'spss_check_license_features']) {
    const value = await call(name, { sessionId });
    assert.ok(value.version);
    record(name);
  }
  const extensionList = await call('spss_list_extensions');
  assert.ok(extensionList.extensions.some(extension => extension.name === 'KNN'));
  await call('spss_get_extension_details', { name: 'KNN' });
  record('Native extension discovery');
  const created = await call('spss_create_dataset', { sessionId, dataset: 'Lifecycle', variables: [{ name: 'x' }, { name: 'y' }, { name: 'grp' }], rows: Array.from({ length: 40 }, (_, i) => [i + 1, i * 2 + i % 3, i % 2]), dryRun: false });
  let revision = created.revision;
  await call('spss_activate_dataset', { sessionId, dataset: 'Lifecycle' });
  const execute = async (name, syntax, extra = {}) => {
    const result = await call(name, { sessionId, dataset: 'Lifecycle', expectedRevision: revision, requestKey: randomUUID(), syntax, dryRun: false, ...extra });
    revision = result.revision;
    record(name);
    return result;
  };
  await execute('spss_execute_extension', 'KNN y WITH x /MODEL NEIGHBORS=FIXED(K=3) /VIEWMODEL DISPLAY=NO.', { extensionName: 'KNN' });
  await execute('spss_run_procedure', 'DESCRIPTIVES x y.');
  await execute('spss_create_variable', 'NUMERIC extra (F8.2).');
  await execute('spss_recode_variable', 'RECODE x (1=10) (ELSE=COPY) INTO recoded.');
  await execute('spss_select_cases', 'TEMPORARY.\nSELECT IF x>1.\nDESCRIPTIVES VARIABLES=x.');
  await execute('spss_filter_cases', 'COMPUTE keep_case=(x>1).\nFILTER BY keep_case.\nDESCRIPTIVES x.');
  await execute('spss_transform_data', 'FILTER OFF.');
  await execute('spss_aggregate_data', 'AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=grp /groupmean=MEAN(x).');
  const syntaxFile = path.join(folder, 'repeatable.sps');
  await call('spss_create_syntax_file', { path: syntaxFile, syntax: 'DESCRIPTIVES x.', dryRun: false });
  const fileResult = await call('spss_execute_syntax_file', { sessionId, dataset: 'Lifecycle', path: syntaxFile, expectedRevision: revision, requestKey: randomUUID(), dryRun: false, formats: ['pdf'] });
  revision = fileResult.revision;
  await call('spss_generate_report', { sessionId, executionId: fileResult.executionId, format: 'pdf', path: path.join(folder, 'report.pdf'), dryRun: false });
  await call('spss_get_output_items', { sessionId, executionId: fileResult.executionId });
  await call('spss_get_pivot_table', { sessionId, executionId: fileResult.executionId });
  await call('spss_get_execution_logs', { sessionId });
  await call('spss_get_execution_logs', { sessionId, executionId: fileResult.executionId });
  await call('spss_save_dataset', { sessionId, dataset: 'Lifecycle', path: path.join(folder, 'copy.sav'), dryRun: false });
  record('Syntax files, report and output gateways');
  const running = call('spss_execute_syntax', { sessionId, dataset: 'Lifecycle', expectedRevision: revision, requestKey: randomUUID(), syntax: 'LOOP #i=1 TO 1000000000.\nCOMPUTE x=x+1.\nEND LOOP.\nEXECUTE.', dryRun: false });
  const rejected = assert.rejects(running, /CANCELLED|CANCEL|CONNECTION/);
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await call('spss_get_connection_status')).busy) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await call('spss_cancel_session', { sessionId });
  await rejected;
  const reset = await call('spss_reset_session', { sessionId });
  assert.equal(reset.active, 'Lifecycle');
  const values = await call('spss_preview_data', { sessionId, limit: 1 });
  assert.equal(values.rows[0][0], 1);
  record('Cancel pending analysis and recover unchanged checkpoint');
  await client.close();
  await connect();
  assert.ok((await call('spss_list_sessions')).sessions.some(session => session.sessionId === sessionId));
  const recovered = await call('spss_start_session', { sessionId });
  assert.equal(recovered.revision, revision);
  await call('spss_stop_session', { sessionId });
  record('MCP process restart recovery');
  status = 'PASS';
} finally {
  await client.close();
  await fs.writeFile(path.join(project, 'documentation', 'SPSS-LIFECYCLE-VERIFICATION.json'), JSON.stringify({ status, sessionId, checks }, null, 2));
}
