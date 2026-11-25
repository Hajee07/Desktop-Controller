import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { discoverInstallation, SpssConnection } from './connection.js';
import { capabilities, extensions } from './registry.js';
import { procedureGroups, quoteSpss, validateSyntax } from './syntax.js';
import { reserveOutput } from '../storage/index.js';
import type { AppContext, CallContext, ToolDefinition } from '../server/types.js';
import { ToolMediaResult } from '../server/media.js';
import { isWithin } from '../security/paths.js';

const sessionId = z.string().uuid();
const datasetName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/);
const filePath = z.string().min(1).max(4096);
const syntax = z.string().min(1).max(100000);
const sessionInput = z.object({ sessionId });
const pageInput = sessionInput.extend({ offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(100).default(20) });
const executeInput = sessionInput.extend({
  dataset: datasetName.optional(), syntax, expectedRevision: z.number().int().min(0),
  requestKey: z.string().uuid(), dryRun: z.boolean().default(true),
  formats: z.array(z.enum(['pdf', 'xlsx', 'html', 'text'])).max(4).default([])
}).strict();
const runtimes = new WeakMap<AppContext, SpssConnection>();

export function comprehensiveSpssTools(ctx: AppContext): ToolDefinition[] {
  let connection = runtimes.get(ctx);
  if (!connection) { connection = new SpssConnection(ctx); runtimes.set(ctx, connection); }
  const engine = connection;
  const tools: ToolDefinition[] = [];
  const add = (name: string, description: string, schema: z.ZodType, readOnly: boolean, execute: ToolDefinition['execute']) => {
    tools.push({ name, description, schema, readOnly, execute });
  };
  const call = (input: any, payload: Record<string, unknown>, c: CallContext) => engine.call(input.sessionId, payload, c.signal);
  async function existing(input: string) {
    const result = await ctx.paths.check(input, 'read');
    const stat = await fs.stat(result);
    if (!stat.isFile() || stat.size > ctx.config.maxReadBytes) throw new Error('SPSS_INPUT_FILE_LIMIT');
    return result;
  }
  async function newOutput(input: string) {
    const result = await ctx.paths.check(input, 'write');
    if (!(await fs.stat(path.dirname(result))).isDirectory()) throw new Error('SPSS_OUTPUT_PARENT_REQUIRED');
    const stat = await fs.lstat(result).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (stat) throw new Error('SPSS_OUTPUT_EXISTS: choose a new file');
    return result;
  }
  async function execution(input: any, c: CallContext, group?: string, trustedSyntax?: string) {
    const installation = await discoverInstallation(ctx);
    const validated = trustedSyntax ? { syntax: trustedSyntax, commands: [] } : validateSyntax(input.syntax, installation.commands, group);
    const hash = createHash('sha256').update(JSON.stringify({ syntax: validated.syntax, dataset: input.dataset, formats: input.formats })).digest('hex');
    const directory = path.join(ctx.config.stateDir, `spss-${input.sessionId}`, `run-${input.requestKey}`);
    const resultFile = path.join(directory, 'result.json');
    try {
      const prior = JSON.parse(await fs.readFile(resultFile, 'utf8'));
      if (prior.hash !== hash) throw new Error('SPSS_REQUEST_KEY_CONFLICT');
      if (prior.status !== 'COMPLETED') throw new Error('SPSS_EXECUTION_UNCERTAIN: inspect history and checkpoint before retrying with a new request key');
      return { ...prior.result, replayed: true };
    } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    if (input.dryRun) return { dryRun: true, ...validated, sessionId: input.sessionId, requestKey: input.requestKey };
    const release = await reserveOutput(ctx, resultFile, Math.min(ctx.config.maxReadBytes, 256 * 1024 * 1024), c.signal);
    try {
      await call(input, { operation: 'status' }, c);
      await fs.mkdir(directory);
      await fs.writeFile(resultFile, JSON.stringify({ hash, status: 'RUNNING' }), { flag: 'wx' });
      await fs.writeFile(path.join(directory, 'syntax.sps'), validated.syntax, { flag: 'wx' });
      const result = await call(input, { operation: 'execute', syntax: validated.syntax, dataset: input.dataset,
        expectedRevision: input.expectedRevision, directory, executionId: input.requestKey, formats: input.formats }, c);
      const files = await fs.readdir(directory);
      const response = { ...result, sessionId: input.sessionId, executionId: input.requestKey, artifacts: files.filter(name => name !== 'result.json') };
      await fs.writeFile(resultFile, JSON.stringify({ hash, status: 'COMPLETED', result: response }));
      return response;
    } finally { release(); }
  }

  add('spss_get_environment', 'Detect the real SPSS 27 installation, bundled interpreter, installed commands and backend integration.', z.object({}).strict(), true, async () => {
    const installation = await discoverInstallation(ctx);
    const { commands, ...details } = installation;
    return { ...details, installedCommandCount: commands.length, sessionId: engine.currentSession ?? null,
      supportedFileGateways: ['sav', 'zsav', 'por', 'csv', 'txt', 'xls', 'xlsx', 'dta', 'sas7bdat'] };
  });
  add('spss_get_version', 'Read the installed SPSS product version and the active bundled Python and plugin versions.', sessionInput.strict(), true, async (i, c) => ({ version: (await discoverInstallation(ctx)).version, ...await call(i, { operation: 'environment' }, c) }));
  for (const [name, field] of [['spss_get_capabilities', null], ['spss_list_modules', 'modules'], ['spss_list_procedures', 'procedures'], ['spss_check_license_features', 'modules']] as const) {
    add(name, 'Query native SPSS SHOW LICENSE and installed command definitions. Reports license evidence separately from procedure execution verification.', sessionInput.strict(), true, async (i, c) => {
      const result = await capabilities(ctx, engine, i.sessionId, c.signal);
      return field ? { version: result.version, [field]: result[field] } : result;
    });
  }
  add('spss_list_commands', 'List installed SPSS 27 command XML definitions with pagination and optional name filtering.', z.object({ search: z.string().max(100).default(''), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(200).default(100) }).strict(), true, async i => {
    const installed = await discoverInstallation(ctx);
    const commands = installed.commands.filter(command => command.includes(i.search.toUpperCase()));
    return { commands: commands.slice(i.offset, i.offset + i.limit), total: commands.length, version: installed.version };
  });
  add('spss_list_extensions', 'Discover installed non-Syntax extension command definitions and language/version metadata without installing packages.', z.object({}).strict(), true, async () => ({ extensions: await extensions(ctx) }));
  add('spss_get_extension_details', 'Read one discovered installed extension command definition, language and declared version.', z.object({ name: z.string().min(1).max(100) }).strict(), true, async i => {
    const found = (await extensions(ctx)).find(extension => extension.name.toUpperCase() === i.name.toUpperCase());
    if (!found) throw new Error('SPSS_EXTENSION_NOT_INSTALLED');
    return { ...found, xml: await fs.readFile(found.definition, 'utf8'), executionStatus: found.language === 'native' && found.name === 'KNN' ? 'AVAILABLE_WITH_LIMITATIONS' : 'NOT_SUPPORTED', limitation: 'Native KNN uses the guarded syntax gateway. Third-party programs need a reviewed package-specific filesystem policy.' };
  });
  add('spss_execute_extension', 'Execute a discovered native KNN extension through guarded SPSS syntax and actual OMS capture. Third-party programming packages require separate review.', executeInput.extend({ extensionName: z.string().min(1).max(100) }).strict(), false, async (i, c) => {
    const found = (await extensions(ctx)).find(extension => extension.name.toUpperCase() === i.extensionName.toUpperCase());
    if (!found) throw new Error('SPSS_EXTENSION_NOT_INSTALLED');
    if (found.language !== 'native' || found.name !== 'KNN') throw new Error('SPSS_EXTENSION_REVIEW_REQUIRED');
    const parsed = validateSyntax(i.syntax, (await discoverInstallation(ctx)).commands);
    if (!parsed.commands.some(command => command.name === found.name)) throw new Error('SPSS_EXTENSION_COMMAND_REQUIRED');
    return execution(i, c);
  });

  add('spss_start_session', 'Start or recover an owned SPSS backend by session ID using the bundled Python 3.8 integration.', z.object({ sessionId: sessionId.optional() }).strict(), false, async (i, c) => {
    const id = i.sessionId ?? engine.currentSession ?? randomUUID();
    const status = await engine.call(id, { operation: 'status' }, c.signal);
    return { sessionId: id, ...status };
  });
  add('spss_get_session_status', 'Read backend process health, dataset checkpoints, active dataset, revision and execution history.', sessionInput.strict(), true, (i, c) => call(i, { operation: 'status' }, c));
  add('spss_get_connection_status', 'Read immediate owned-backend health and busy status without waiting behind a running analysis.', z.object({}).strict(), true, async () => engine.health);
  add('spss_cancel_session', 'Cancel a running operation by stopping only the matching connector-owned SPSS process tree. Recover the last committed checkpoint before retrying.', sessionInput.strict(), false, async i => {
    if (engine.currentSession !== i.sessionId) throw new Error('SPSS_SESSION_ID_MISMATCH');
    engine.close(new Error('SPSS_OPERATION_CANCELLED: recover and inspect the checkpoint before retrying'));
    return { cancelled: true, sessionId: i.sessionId, recoveryRequired: true };
  });
  add('spss_list_sessions', 'Find locally stored managed SPSS session checkpoints for explicit recovery after reconnecting.', z.object({}).strict(), true, async () => {
    const sessions = [];
    for (const entry of await fs.readdir(ctx.config.stateDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !/^spss-[0-9a-f-]{36}$/i.test(entry.name)) continue;
      const file = path.join(ctx.config.stateDir, entry.name, 'state.json');
      const info = await fs.lstat(file).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink() || info.size > 1_000_000) continue;
      const state = JSON.parse(await fs.readFile(file, 'utf8'));
      sessions.push({ sessionId: entry.name.slice(5), revision: state.revision, active: state.active, datasetNames: Object.keys(state.datasets), modifiedAt: info.mtime.toISOString() });
    }
    return { current: engine.currentSession ?? null, sessions };
  });
  add('spss_stop_session', 'Stop the owned backend after preserving existing checkpoints. Closes only this connector backend process tree.', sessionInput.strict(), false, async (i, c) => {
    const status = await call(i, { operation: 'status' }, c);
    engine.close();
    return { stopped: true, sessionId: i.sessionId, revision: status.revision, recoverable: true };
  });
  add('spss_reset_session', 'Restart the owned SPSS backend and recover its committed dataset checkpoints.', sessionInput.strict(), false, async (i, c) => {
    if (engine.currentSession && engine.currentSession !== i.sessionId) throw new Error('SPSS_SESSION_ID_MISMATCH');
    engine.close();
    return { recovered: true, sessionId: i.sessionId, ...await call(i, { operation: 'status' }, c) };
  });
  add('spss_list_datasets', 'List managed dataset names, original sources, checkpoint files and the active dataset.', sessionInput.strict(), true, async (i, c) => {
    const state = await call(i, { operation: 'status' }, c);
    return { datasets: state.datasets, active: state.active, revision: state.revision };
  });
  add('spss_activate_dataset', 'Activate one named dataset in the persistent managed backend.', sessionInput.extend({ dataset: datasetName }).strict(), false, (i, c) => call(i, { operation: 'activate', dataset: i.dataset }, c));
  add('spss_close_dataset', 'Close one managed dataset after its automatic checkpoint has been committed.', sessionInput.extend({ dataset: datasetName }).strict(), false, (i, c) => call(i, { operation: 'close', dataset: i.dataset }, c));
  add('spss_create_dataset', 'Create a managed dataset through the native SPSS Dataset API from bounded variable definitions and rows.', sessionInput.extend({ dataset: datasetName,
    variables: z.array(z.object({ name: datasetName, width: z.number().int().min(0).max(32767).default(0) }).strict()).min(1).max(100),
    rows: z.array(z.array(z.union([z.number().finite(), z.string().max(32767), z.null()])).max(100)).max(1000).default([]),
    dryRun: z.boolean().default(true)
  }).strict(), false, async (i, c) => {
    if (new Set(i.variables.map((v: any) => v.name.toLowerCase())).size !== i.variables.length) throw new Error('SPSS_DUPLICATE_VARIABLE');
    for (const row of i.rows) {
      if (row.length !== i.variables.length) throw new Error('SPSS_ROW_WIDTH_MISMATCH');
      row.forEach((value: any, index: number) => {
        if (value !== null && (i.variables[index].width === 0 ? typeof value !== 'number' : typeof value !== 'string' || Buffer.byteLength(value) > i.variables[index].width)) throw new Error('SPSS_CELL_TYPE_MISMATCH');
      });
    }
    if (Buffer.byteLength(JSON.stringify(i)) > 500000) throw new Error('SPSS_CREATE_PAYLOAD_LIMIT');
    if (i.dryRun) return { dryRun: true, dataset: i.dataset, variables: i.variables.length, rows: i.rows.length };
    return call(i, { operation: 'create', dataset: i.dataset, variables: i.variables, rows: i.rows }, c);
  });
  for (const operation of ['copy', 'rename']) add(`spss_${operation}_dataset`, `Use native SPSS dataset ${operation} and commit a recoverable checkpoint.`, sessionInput.extend({ dataset: datasetName, name: datasetName, dryRun: z.boolean().default(true) }).strict(), false, async (i, c) => {
    if (i.dryRun) return { dryRun: true, operation, dataset: i.dataset, name: i.name };
    return call(i, { operation, dataset: i.dataset, name: i.name }, c);
  });
  for (const name of ['spss_get_dataset_metadata', 'spss_get_variable_dictionary']) {
    add(name, 'Read paginated native variable names, labels, storage types, formats, measurement levels and roles.', pageInput.extend({ dataset: datasetName.optional() }).strict(), true, (i, c) => call(i, { operation: 'metadata', dataset: i.dataset, offset: i.offset, limit: i.limit }, c));
  }
  add('spss_preview_data', 'Read bounded actual rows from the managed active dataset through the native SPSS cursor.', pageInput.extend({ dataset: datasetName.optional() }).strict(), true, (i, c) => call(i, { operation: 'preview', dataset: i.dataset, offset: i.offset, limit: i.limit }, c));

  const openInput = sessionInput.extend({ path: filePath, dataset: datasetName, dryRun: z.boolean().default(true),
    sheet: z.number().int().min(1).max(1000).default(1),
    columns: z.array(z.object({ name: datasetName, format: z.string().regex(/^(?:F\d{1,3}(?:\.\d{1,2})?|A\d{1,5})$/) }).strict()).max(500).optional(),
    delimiter: z.enum([',', '\t', ';']).default(','), firstCase: z.number().int().min(1).max(100).default(2)
  }).strict();
  for (const name of ['spss_open_dataset', 'spss_import_data']) {
    add(name, 'Open authorized SAV/ZSAV, POR, Excel, delimited text, Stata or SAS data into a named owned dataset. Text import requires explicit column formats.', openInput, false, async (i, c) => {
      const source = await existing(i.path), extension = path.extname(source).toLowerCase();
      let command: string;
      if (['.sav', '.zsav'].includes(extension)) command = 'GET FILE=' + quoteSpss(source) + '.';
      else if (extension === '.por') command = 'IMPORT FILE=' + quoteSpss(source) + '.';
      else if (['.xlsx', '.xls'].includes(extension)) command = `GET DATA /TYPE=${extension.slice(1).toUpperCase()} /FILE=${quoteSpss(source)} /SHEET=INDEX ${i.sheet} /READNAMES=ON.`;
      else if (['.csv', '.txt'].includes(extension)) {
        if (!i.columns?.length) throw new Error('SPSS_TEXT_COLUMNS_REQUIRED');
        command = `GET DATA /TYPE=TXT /FILE=${quoteSpss(source)} /ENCODING='UTF8' /ARRANGEMENT=DELIMITED /DELCASE=LINE /DELIMITERS=${quoteSpss(i.delimiter)} /QUALIFIER='"' /FIRSTCASE=${i.firstCase} /VARIABLES=${i.columns.map((v: any) => `${v.name} ${v.format}`).join(' ')}.`;
      } else if (['.dta', '.sas7bdat'].includes(extension)) command = `GET ${extension === '.dta' ? 'STATA' : 'SAS'} DATA=${quoteSpss(source)}.`;
      else throw new Error('SPSS_IMPORT_FORMAT_NOT_SUPPORTED');
      if (i.dryRun) return { dryRun: true, source, dataset: i.dataset, syntax: command };
      return call(i, { operation: 'open', syntax: command, dataset: i.dataset, source }, c);
    });
  }
  const saveInput = sessionInput.extend({ dataset: datasetName, path: filePath, dryRun: z.boolean().default(true) }).strict();
  for (const name of ['spss_save_dataset', 'spss_export_data']) {
    add(name, 'Save a managed dataset to a new authorized SAV, ZSAV, CSV or XLSX file with no overwrite. Portable POR export is unavailable in the required Python 3 Unicode backend.', saveInput, false, async (i, c) => {
      const output = await newOutput(i.path), extension = path.extname(output).toLowerCase();
      if (extension === '.por') throw new Error('SPSS_POR_EXPORT_NOT_SUPPORTED: SPSS 27 EXPORT rejects Unicode mode, while the installed Python 3 integration requires Unicode mode. Use SAV or ZSAV.');
      if (!['.sav', '.zsav', '.csv', '.xlsx'].includes(extension)) throw new Error('SPSS_EXPORT_FORMAT_NOT_SUPPORTED');
      const directory = await fs.mkdtemp(path.join(ctx.config.stateDir, 'spss-export-'));
      const destination = path.join(directory, 'data' + extension);
      let command: string;
      if (['.sav', '.zsav'].includes(extension)) command = `SAVE OUTFILE=${quoteSpss(destination)} ${extension === '.zsav' ? '/ZCOMPRESSED' : '/COMPRESSED'}.`;
      else if (['.csv', '.xlsx'].includes(extension)) command = `SAVE TRANSLATE OUTFILE=${quoteSpss(destination)} /TYPE=${extension === '.csv' ? 'CSV' : 'XLS'} ${extension === '.xlsx' ? '/VERSION=12' : ''} /FIELDNAMES /CELLS=VALUES.`;
      else throw new Error('SPSS_EXPORT_FORMAT_NOT_SUPPORTED');
      if (i.dryRun) { await fs.rmdir(directory); return { dryRun: true, output, dataset: i.dataset, format: extension }; }
      const release = await reserveOutput(ctx, output, Math.min(ctx.config.maxReadBytes, 256 * 1024 * 1024), c.signal);
      try {
        await call(i, { operation: 'save', syntax: command, dataset: i.dataset, destination }, c);
        const info = await fs.stat(destination);
        if (info.size > ctx.config.maxReadBytes) throw new Error('SPSS_EXPORT_SIZE_LIMIT');
        c.signal.throwIfAborted(); ctx.emergency.assertRunning();
        await fs.copyFile(destination, await ctx.paths.check(output, 'write'), constants.COPYFILE_EXCL);
        return { saved: output, bytes: info.size };
      } finally {
        release();
        for (const name of [path.basename(destination), 'output.spv', 'output.xml']) await fs.unlink(path.join(directory, name)).catch(() => {});
        await fs.rmdir(directory).catch(() => {});
      }
    });
  }

  add('spss_validate_syntax', 'Validate complete native command syntax against the installed 27 definitions and connector filesystem policy. Semantic errors require execution against data.', z.object({ syntax }).strict(), true, async i => validateSyntax(i.syntax, (await discoverInstallation(ctx)).commands));
  add('spss_execute_syntax', 'Execute guarded native SPSS syntax with an exact dataset revision and idempotency key. Captures actual SPV, OMS XML, tables and warnings.', executeInput, false, (i, c) => execution(i, c));
  add('spss_execute_syntax_file', 'Read an authorized SPS file and execute its policy-validated syntax with checkpoint and actual OMS output.', executeInput.omit({ syntax: true }).extend({ path: filePath }).strict(), false, async (i, c) => {
    const source = await existing(i.path);
    if (path.extname(source).toLowerCase() !== '.sps' || (await fs.stat(source)).size > 100000) throw new Error('SPSS_SYNTAX_FILE_LIMIT');
    return execution({ ...i, syntax: await fs.readFile(source, 'utf8') }, c);
  });
  add('spss_create_syntax_file', 'Validate and save reproducible native SPSS syntax to a new authorized SPS file.', z.object({ path: filePath, syntax, dryRun: z.boolean().default(true) }).strict(), false, async (i, c) => {
    validateSyntax(i.syntax, (await discoverInstallation(ctx)).commands);
    const output = await newOutput(i.path);
    if (!/\.sps$/i.test(output)) throw new Error('SPSS_SPS_PATH_REQUIRED');
    if (i.dryRun) return { dryRun: true, path: output };
    c.signal.throwIfAborted(); await fs.writeFile(await ctx.paths.check(output, 'write'), i.syntax, { flag: 'wx' });
    return { path: output, bytes: Buffer.byteLength(i.syntax) };
  });
  const gatewayGroups: Record<string, string | undefined> = {
    spss_run_analysis: undefined, spss_run_procedure: undefined, spss_run_statistical_test: 'tests', spss_run_regression: 'regression',
    spss_run_anova: 'anova', spss_run_correlation: 'correlation', spss_run_factor_analysis: 'factor', spss_run_cluster_analysis: 'cluster',
    spss_run_survival_analysis: 'survival', spss_run_forecasting: 'forecasting', spss_run_decision_tree: 'decision_tree',
    spss_run_neural_network: 'neural_network', spss_run_bootstrap: 'bootstrap', spss_run_power_analysis: 'power', spss_create_chart: 'chart'
  };
  for (const [name, group] of Object.entries(gatewayGroups)) {
    add(name, `Run ${group ?? 'supported native'} SPSS syntax through the installed processor. Uses checkpoint, exact revision, request key and actual OMS output. Native license errors are returned.`, executeInput, false, (i, c) => execution(group === 'chart' && !i.formats.length ? { ...i, formats: ['html'] } : i, c, group));
  }
  const transformationNames = ['spss_create_variable', 'spss_compute_variable', 'spss_recode_variable', 'spss_select_cases', 'spss_filter_cases', 'spss_sort_cases', 'spss_aggregate_data', 'spss_transform_data', 'spss_manage_value_labels', 'spss_manage_missing_values'];
  for (const name of transformationNames) add(name, 'Apply native transformation syntax to the managed working dataset. Persists a checkpoint after success and restores the prior dataset after failure.', executeInput, false, (i, c) => execution(i, c));
  add('spss_execute_python', 'Evaluate a bounded numerical Python expression in bundled SPSS Python 3.8. Supports arithmetic, math, aggregates, case_count() and variable_count().', sessionInput.extend({ expression: z.string().min(1).max(4000) }).strict(), true, (i, c) => call(i, { operation: 'python', expression: i.expression }, c));
  add('spss_get_execution_logs', 'Read managed execution statuses and unresolved requests. An optional execution ID retrieves actual SPSS log text from OMS.', sessionInput.extend({ limit: z.number().int().min(1).max(500).default(50), executionId: z.string().uuid().optional() }).strict(), true, async (i, c) => {
    const history = await call(i, { operation: 'history', limit: i.limit }, c);
    const root = path.join(ctx.config.stateDir, `spss-${i.sessionId}`);
    const unresolved = [];
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !/^run-[a-f0-9-]{36}$/i.test(entry.name)) continue;
      const manifest = path.join(root, entry.name, 'result.json');
      const info = await fs.lstat(manifest).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink() || info.size > 2_000_000) continue;
      const saved = JSON.parse(await fs.readFile(manifest, 'utf8'));
      if (saved.status !== 'COMPLETED') unresolved.push({ executionId: entry.name.slice(4), status: 'REVIEW_REQUIRED' });
    }
    const logs = i.executionId ? await call(i, { operation: 'output', path: path.join(root, `run-${i.executionId}`, 'output.xml'), limit: 100 }, c) : null;
    return { ...history, unresolved, logs: logs?.items.filter((item: any) => item.kind === 'textBlock') ?? [] };
  });

  const resultInput = pageInput.extend({ executionId: z.string().uuid() }).strict();
  for (const name of ['spss_get_output', 'spss_get_output_items', 'spss_get_pivot_table']) {
    add(name, 'Read paginated actual OMS table cells, numeric attributes, labels and footnotes from a completed SPSS execution.', resultInput, true, (i, c) => call(i, { operation: 'output', path: path.join(ctx.config.stateDir, `spss-${i.sessionId}`, `run-${i.executionId}`, 'output.xml'), offset: i.offset, limit: i.limit }, c));
  }
  const exportSchema = sessionInput.extend({ executionId: z.string().uuid(), format: z.enum(['spv', 'xml', 'pdf', 'xlsx', 'html', 'text', 'sps']), path: filePath, dryRun: z.boolean().default(true) }).strict();
  const exportResult: ToolDefinition['execute'] = async (i, c) => {
    const output = await newOutput(i.path);
    if (!(i.format === 'text' ? ['.txt', '.text'] : ['.' + i.format]).includes(path.extname(output).toLowerCase())) throw new Error('SPSS_EXPORT_EXTENSION_MISMATCH');
    const source = path.join(ctx.config.stateDir, `spss-${i.sessionId}`, `run-${i.executionId}`, i.format === 'sps' ? 'syntax.sps' : 'output.' + i.format);
    const info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink() || info.size > ctx.config.maxReadBytes) throw new Error('SPSS_OUTPUT_ARTIFACT_INVALID');
    if (i.dryRun) return { dryRun: true, path: output, bytes: info.size };
    let html: string | undefined;
    if (i.format === 'html') {
      html = await fs.readFile(source, 'utf8');
      for (const match of [...html.matchAll(/src=(["'])([^"']+)\1/gi)]) {
        if (/^(?:data:|https?:)/i.test(match[2])) continue;
        const asset = path.resolve(path.dirname(source), decodeURIComponent(match[2]));
        if (!isWithin(path.dirname(source), asset) || !/\.(?:png|jpe?g|gif)$/i.test(asset)) throw new Error('SPSS_HTML_ASSET_UNSUPPORTED');
        const stat = await fs.lstat(asset);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('SPSS_HTML_ASSET_LIMIT');
        const mime = /\.png$/i.test(asset) ? 'image/png' : /\.gif$/i.test(asset) ? 'image/gif' : 'image/jpeg';
        html = html.replace(match[0], `src="data:${mime};base64,${(await fs.readFile(asset)).toString('base64')}"`);
      }
      if (Buffer.byteLength(html) > ctx.config.maxReadBytes) throw new Error('SPSS_HTML_EXPORT_LIMIT');
    }
    const bytes = html === undefined ? info.size : Buffer.byteLength(html);
    const release = await reserveOutput(ctx, output, bytes, c.signal);
    try {
      c.signal.throwIfAborted();
      const destination = await ctx.paths.check(output, 'write');
      if (html === undefined) await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
      else await fs.writeFile(destination, html, { flag: 'wx' });
    }
    finally { release(); }
    return { path: output, bytes };
  };
  add('spss_export_output', 'Copy a completed native SPSS output artifact to a new authorized path. PDF, XLSX, HTML and text must be requested when executing the analysis.', exportSchema, false, exportResult);
  add('spss_generate_report', 'Save a native SPSS PDF, spreadsheet, HTML or text report generated by the requested execution. Select requested formats when executing analyses.', exportSchema, false, exportResult);
  add('spss_get_chart', 'Retrieve an actual PNG/JPEG chart generated by SPSS HTML export. Requires html in the analysis formats. Returns native image pixels for inspection.', sessionInput.extend({ executionId: z.string().uuid(), index: z.number().int().min(0).max(499).default(0) }).strict(), true, async i => {
    const directory = path.join(ctx.config.stateDir, `spss-${i.sessionId}`, `run-${i.executionId}`);
    const htmlPath = path.join(directory, 'output.html');
    const htmlInfo = await fs.lstat(htmlPath).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (htmlInfo) {
      if (!htmlInfo.isFile() || htmlInfo.isSymbolicLink() || htmlInfo.size > 64 * 1024 * 1024) throw new Error('SPSS_HTML_OUTPUT_LIMIT');
      const html = await fs.readFile(htmlPath, 'utf8');
      const embedded = [...html.matchAll(/src=["']data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)["']/gi)];
      if (embedded.length) {
        const selected = embedded[i.index];
        if (!selected) throw new Error('SPSS_CHART_INDEX_INVALID');
        const data = selected[2].replace(/\s/g, '');
        if (data.length > 11_000_000) throw new Error('SPSS_CHART_IMAGE_LIMIT');
        return new ToolMediaResult({ executionId: i.executionId, index: i.index, totalImages: embedded.length, provenance: 'Native SPSS HTML chart image' }, [{ data, mimeType: selected[1].toLowerCase() === 'png' ? 'image/png' : 'image/jpeg' }]);
      }
    }
    const images: string[] = [];
    const pending = [directory];
    let inspected = 0;
    while (pending.length) {
      const current = pending.pop()!;
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        if (++inspected > 500) throw new Error('SPSS_CHART_FILE_LIMIT');
        if (entry.isSymbolicLink()) throw new Error('SPSS_ARTIFACT_LINK_DENIED');
        const filename = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(filename);
        else if (entry.isFile() && /\.(?:png|jpe?g)$/i.test(entry.name)) images.push(filename);
      }
    }
    images.sort();
    const selected = images[i.index];
    if (!selected) throw new Error('SPSS_CHART_NOT_AVAILABLE: request HTML export when creating charts');
    const info = await fs.stat(selected);
    if (info.size > 8 * 1024 * 1024) throw new Error('SPSS_CHART_IMAGE_LIMIT');
    return new ToolMediaResult({ executionId: i.executionId, index: i.index, totalImages: images.length, provenance: 'Native SPSS chart export' }, [{ data: (await fs.readFile(selected)).toString('base64'), mimeType: /\.png$/i.test(selected) ? 'image/png' : 'image/jpeg' }]);
  });
  add('spss_merge_datasets', 'Add cases or match variables from two managed datasets using native SPSS syntax, with a checkpoint and exact revision.', executeInput.omit({ syntax: true, dataset: true }).extend({ dataset: datasetName, otherDataset: datasetName, mode: z.enum(['add_cases', 'match_variables']), by: z.array(datasetName).max(20).default([]) }).strict(), false, async (i, c) => {
    if (i.dataset === i.otherDataset) throw new Error('SPSS_DISTINCT_DATASETS_REQUIRED');
    const state = await call(i, { operation: 'status' }, c);
    if (!state.datasets[i.dataset] || !state.datasets[i.otherDataset]) throw new Error('SPSS_DATASET_NOT_FOUND');
    if (i.mode === 'match_variables' && !i.by.length) throw new Error('SPSS_MERGE_KEY_REQUIRED');
    const command = `${i.mode === 'add_cases' ? 'ADD FILES' : 'MATCH FILES'} /FILE=* /FILE=${i.otherDataset}${i.by.length ? ' /BY ' + i.by.join(' ') : ''}.`;
    return execution(i, c, undefined, command);
  });
  return tools;
}
