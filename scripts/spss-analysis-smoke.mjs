import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import JSZip from 'jszip';
import { spssPython } from '../dist/windows/spss-analysis.js';

const project = fileURLToPath(new URL('..', import.meta.url));
const base = path.join(project, 'test-results');
await fs.mkdir(base, { recursive: true });
const folder = await fs.mkdtemp(path.join(base, 'spss-'));
const dataset = path.join(folder, "synthetic study's data.sav");
const configuration = JSON.parse(await fs.readFile(path.join(project, 'config.json'), 'utf8'));
configuration.authorizedRoots = [folder];
const configPath = path.join(folder, 'config.json');
const fixture = String.raw`import spss, sys
spss.Submit(['DATA LIST FREE / x z y.', 'BEGIN DATA\n1 2 3\n2 1 4\n3 3 7\n4 2 9\n5 5 10\n6 4 13\nEND DATA.', "SAVE OUTFILE='" + sys.argv[1].replace(chr(92), '/').replace("'", "''") + "'."])
spss.StopSPSS()`;
const client = new Client({ name: 'spss-analysis-smoke', version: '1.0.0' });
try {
  execFileSync(spssPython, ['-I', '-c', fixture, dataset], { timeout: 30000 });
  const original = await fs.readFile(dataset);
  await fs.writeFile(configPath, JSON.stringify(configuration));
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'dist', 'index.js')], cwd: project, env: { ...process.env, WINDOWS_MCP_CONFIG: configPath } }));
  const listed = await client.listTools();
  for (const name of ['spss_dataset_inspect', 'spss_analysis_run', 'spss_output_open']) assert.ok(listed.tools.some(tool => tool.name === name));
  const call = async (name, args) => {
    const reply = await client.callTool({ name, arguments: args });
    return { error: reply.isError, value: reply.isError ? reply.content[0].text : JSON.parse(reply.content[0].text) };
  };
  const inspected = await call('spss_dataset_inspect', { path: dataset, limit: 2 });
  assert.equal(inspected.value.caseCount, 6, JSON.stringify(inspected));
  assert.deepEqual(inspected.value.variables.map(variable => variable.name.toLowerCase()), ['x', 'z']);
  assert.equal(inspected.value.nextOffset, 2);
  assert.match((await call('spss_dataset_inspect', { path: path.join(project, 'outside.sav') })).value, /PATH_DENIED/);
  for (const [procedure, table] of Object.entries({ descriptives: 'Descriptive Statistics', frequencies: 'Frequency Table|Frequency', correlation: 'Correlations', reliability: 'Reliability Statistics', regression: 'Model Summary' })) {
    const outputPath = path.join(folder, procedure + '.spv');
    const args = { path: dataset, procedure, variables: ['x', 'z'], outputPath, ...(procedure === 'regression' ? { dependent: 'y' } : {}) };
    assert.equal((await call('spss_analysis_run', args)).value.dryRun, true);
    await assert.rejects(fs.stat(outputPath), { code: 'ENOENT' });
    const result = await call('spss_analysis_run', { ...args, dryRun: false });
    assert.equal(result.value.caseCount, 6, JSON.stringify(result));
    const archive = await JSZip.loadAsync(await fs.readFile(outputPath));
    const xml = await Promise.all(Object.values(archive.files).filter(file => /\.xml$/i.test(file.name)).map(file => file.async('string')));
    assert.match(xml.join('\n'), new RegExp(table, 'i'), procedure);
    assert.match((await call('spss_analysis_run', { ...args, dryRun: false })).value, /new output file/);
    console.log(`Verified native SPSS ${procedure} SPV output`);
  }
  assert.deepEqual(await fs.readFile(dataset), original);
} finally {
  await client.close();
  const real = await fs.realpath(folder);
  assert.equal(path.dirname(real).toLowerCase(), base.toLowerCase());
  await fs.rm(real, { recursive: true, force: true });
}
