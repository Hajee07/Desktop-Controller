import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const project = fileURLToPath(new URL('..', import.meta.url));
const base = path.join(project, 'test-results');
const folder = await fs.mkdtemp(path.join(base, 'spss-output-'));
const config = JSON.parse(await fs.readFile(path.join(project, 'config.json'), 'utf8'));
config.authorizedRoots = [folder]; config.toolTimeoutMs = 110000;
const configuration = path.join(folder, 'config.json');
await fs.writeFile(configuration, JSON.stringify(config));
const sessionId = randomUUID();
const client = new Client({ name: 'spss-output-acceptance', version: '1.0.0' });
const checks = [];
let status = 'FAIL';
const call = async (name, args = {}) => {
  const reply = await client.callTool({ name, arguments: args }, { timeout: 125000 });
  assert.ok(!reply.isError, name + ': ' + JSON.stringify(reply));
  checks.push(name);
  console.log('PASS ' + name);
  return { value: JSON.parse(reply.content[0].text), images: reply.content.filter(content => content.type === 'image') };
};
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'dist/index.js')], cwd: project, env: { ...process.env, WINDOWS_MCP_CONFIG: configuration }, stderr: 'pipe' }));
  await call('spss_start_session', { sessionId });
  const created = await call('spss_create_dataset', { sessionId, dataset: 'Example', variables: [{ name: 'x' }, { name: 'y' }], rows: Array.from({ length: 20 }, (_, i) => [i + 1, (i + 1) * 2]), dryRun: false });
  const chart = await call('spss_create_chart', { sessionId, dataset: 'Example', expectedRevision: created.value.revision, requestKey: randomUUID(), syntax: 'GRAPH /HISTOGRAM(NORMAL)=x.', dryRun: false });
  const args = { sessionId, executionId: chart.value.executionId };
  const pixels = await call('spss_get_chart', args);
  assert.equal(pixels.images.length, 1);
  assert.ok(pixels.images[0].data.length > 1000);
  const html = path.join(folder, 'chart.html');
  await call('spss_export_output', { ...args, format: 'html', path: html, dryRun: false });
  assert.match(await fs.readFile(html, 'utf8'), /src="data:image\//);
  for (const extension of ['sav', 'zsav', 'csv', 'xlsx']) {
    const filename = path.join(folder, 'data.' + extension);
    await call('spss_export_data', { sessionId, dataset: 'Example', path: filename, dryRun: false });
    const imported = await call('spss_import_data', { sessionId, dataset: 'Imported' + extension, path: filename, dryRun: false,
      ...(extension === 'csv' ? { columns: [{ name: 'x', format: 'F8.2' }, { name: 'y', format: 'F8.2' }] } : {}) });
    assert.equal(imported.value.caseCount, 20);
  }
  const spv = path.join(folder, 'viewer.spv');
  await call('spss_export_output', { ...args, format: 'spv', path: spv, dryRun: false });
  const opened = await call('spss_output_open', { path: spv });
  assert.equal(opened.value.verifiedVisible, true);
  const list = (await call('spss_output_list')).value;
  const chartItem = list.objects.find(item => /chart/i.test(item.type));
  const table = list.objects.find(item => /pivot|table/i.test(item.type));
  assert.ok(chartItem);
  assert.ok(table);
  await call('spss_output_select', { index: chartItem.index });
  const values = await call('spss_output_values', { index: table.index, maxRows: 2, maxColumns: 3 });
  assert.ok(values.value.rows.length > 0);
  await call('spss_get_application_status');
  for (const format of ['pdf', 'doc', 'xlsx', 'text']) {
    const exported = await call('spss_viewer_export_output', { path: path.join(folder, 'viewer.' + format), format, dryRun: false });
    assert.ok(exported.value.bytes > 0);
  }
  await call('spss_viewer_export_chart', { path: path.join(folder, 'viewer-chart.png'), format: 'png', index: chartItem.index, dryRun: false });
  await call('spss_viewer_close_output');
  await call('spss_stop_session', { sessionId });
  const portable = await client.callTool({ name: 'spss_export_data', arguments: { sessionId, dataset: 'Example', path: path.join(folder, 'portable.por'), dryRun: true } });
  assert.equal(portable.isError, true);
  assert.match(portable.content[0].text, /SPSS_POR_EXPORT_NOT_SUPPORTED/);
  checks.push('SPSS 27 Python3 Unicode POR export limitation reported');
  status = 'PASS';
} finally {
  await client.close();
  await fs.writeFile(path.join(project, 'documentation', 'SPSS-OUTPUT-VERIFICATION.json'), JSON.stringify({ status, checks, sessionId, fixture: folder }, null, 2));
  // Retain all generated files so image and exported-document formats can be inspected.
}
