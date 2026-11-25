import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import TOML from '@iarna/toml';

const executeFile = promisify(execFile);
const modulePath = fileURLToPath(import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const equivalent = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const quote = value => JSON.stringify(value);

/** Refuse aliases/reparse points and hard-linked config files, including parent paths. */
export async function assertSafeConfigPath(input) {
  const absolute = path.resolve(input);
  if (!path.isAbsolute(input) || input.startsWith('\\\\') || input.includes('\0')) throw new Error('Configuration path must be an absolute local path.');
  const root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info) continue;
    if (info.isSymbolicLink()) throw new Error('Configuration and parent paths cannot be symlinks or junctions.');
    if (!equivalent(await fs.realpath(current), current)) throw new Error('Configuration path cannot use aliases.');
    if (current !== absolute && !info.isDirectory()) throw new Error('Configuration parent must be a directory.');
    if (current === absolute && (!info.isFile() || info.nlink > 1)) throw new Error('Configuration must be an ordinary file with one hard link.');
  }
  return absolute;
}

async function readSnapshot(configPath) {
  await assertSafeConfigPath(configPath);
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const info = await fs.lstat(configPath);
    return { exists: true, content, hash: digest(content), identity: `${info.dev}:${info.ino}` };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, content: '', hash: digest(''), identity: null };
    throw error;
  }
}

/** Prepare only. Existing configuration text is never printed or reformatted. */
export async function prepareRegistration({ projectDir, nodePath = process.execPath, configPath, passwordEnvNames = [] }) {
  const project = await fs.realpath(path.resolve(projectDir));
  const node = await fs.realpath(path.resolve(nodePath));
  if (!(await fs.stat(node)).isFile()) throw new Error('Node executable is missing.');
  const target = await assertSafeConfigPath(configPath);
  const before = await readSnapshot(target);
  const databaseEnvironment = [...new Set(passwordEnvNames)];
  if (databaseEnvironment.some(name => typeof name !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(name))) throw new Error('Database password environment names must use uppercase letters, digits, and underscores.');
  const parsed = TOML.parse(before.content.replace(/^\uFEFF/, ''));
  if (parsed.mcp_servers !== undefined && (typeof parsed.mcp_servers !== 'object' || Array.isArray(parsed.mcp_servers))) throw new Error('Existing mcp_servers must be a TOML table.');
  if (Object.hasOwn(parsed.mcp_servers ?? {}, 'windows_laptop')) throw new Error('An mcp_servers.windows_laptop entry already exists. Refusing to overwrite it; review it manually.');
  const snippet = [
    '[mcp_servers.windows_laptop]',
    `command = ${quote(node)}`,
    `args = [${quote(path.join(project, 'dist', 'index.js'))}]`,
    `cwd = ${quote(project)}`,
    'startup_timeout_sec = 30',
    'tool_timeout_sec = 120',
    'default_tools_approval_mode = "prompt"',
    'supports_parallel_tool_calls = false',
    ...(databaseEnvironment.length ? [`env_vars = [${databaseEnvironment.map(quote).join(', ')}]`] : []),
    '',
    '[mcp_servers.windows_laptop.env]',
    `PLAYWRIGHT_BROWSERS_PATH = ${quote(path.join(project, '.state', 'browsers'))}`,
    ''
  ].join('\n');
  const content = `${before.content}${before.content.endsWith('\n') || !before.content ? '' : '\n'}\n${snippet}`;
  const after = TOML.parse(content.replace(/^\uFEFF/, ''));
  const { windows_laptop: added, ...serversAfter } = after.mcp_servers;
  if (!added || digest(JSON.stringify(serversAfter)) !== digest(JSON.stringify(parsed.mcp_servers ?? {}))) throw new Error('Configuration preservation check failed.');
  const { mcp_servers: _oldServers, ...otherBefore } = parsed;
  const { mcp_servers: _newServers, ...otherAfter } = after;
  if (digest(JSON.stringify(otherBefore)) !== digest(JSON.stringify(otherAfter))) throw new Error('Existing settings would change.');
  return Object.freeze({ configPath: target, projectDir: project, nodePath: node, beforeHash: before.hash, beforeIdentity: before.identity, existed: before.exists, content, snippet });
}

async function assertUnchanged(plan) {
  const now = await readSnapshot(plan.configPath);
  if (now.exists !== plan.existed || now.hash !== plan.beforeHash || now.identity !== plan.beforeIdentity) throw new Error('Codex configuration changed after preview. Nothing was replaced; rerun registration.');
  return now;
}

/** Confirmation callback is injected only for isolated unit tests; the CLI always asks locally. */
export async function applyRegistration(plan, { confirm }) {
  if (await confirm(plan) !== 'REGISTER') return { applied: false, reason: 'Registration declined.' };
  await assertUnchanged(plan);
  const parent = path.dirname(plan.configPath);
  await fs.mkdir(parent, { recursive: true });
  await assertSafeConfigPath(plan.configPath);
  const lockPath = `${plan.configPath}.windows-laptop-registration.lock`;
  const lock = await fs.open(lockPath, 'wx', 0o600).catch(error => { if (error.code === 'EEXIST') throw new Error('Another registration is running. Review its lock before retrying.'); throw error; });
  const temporary = path.join(parent, `.windows-laptop-${randomUUID()}.tmp`);
  let temporaryCreated = false;
  let backupPath = null;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    const current = await assertUnchanged(plan);
    if (plan.existed) {
      backupPath = `${plan.configPath}.windows-laptop-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.bak`;
      const backup = await fs.open(backupPath, 'wx', 0o600);
      try { await backup.writeFile(current.content, 'utf8'); await backup.sync(); } finally { await backup.close(); }
    }
    const output = await fs.open(temporary, 'wx', 0o600);
    temporaryCreated = true;
    try { await output.writeFile(plan.content, 'utf8'); await output.sync(); } finally { await output.close(); }
    await assertUnchanged(plan);
    if (plan.existed) {
      // A same-directory rename installs a complete file atomically. All cooperating registrations use the lock.
      await fs.rename(temporary, plan.configPath);
      temporaryCreated = false;
    } else {
      // Hard-link create is exclusive: a concurrent config creation must never be overwritten.
      await fs.link(temporary, plan.configPath);
      await fs.unlink(temporary);
      temporaryCreated = false;
    }
    return { applied: true, configPath: plan.configPath, backupPath };
  } finally {
    if (temporaryCreated) await fs.unlink(temporary).catch(() => {});
    await lock.close();
    await fs.unlink(lockPath).catch(() => {});
  }
}

async function locateCommand(name) {
  try {
    const { stdout } = await executeFile(process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe') : 'which', [name], { timeout: 10000, windowsHide: true });
    return stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? null;
  } catch { return null; }
}

export async function verifyInstallation(projectDir) {
  const version = process.versions.node.split('.').map(Number);
  if (version[0] < 24 || (version[0] === 24 && version[1] < 15)) throw new Error('Node.js 24.15 or newer supported LTS is required.');
  const npmCommand = await locateCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const candidates = [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...(npmCommand ? [path.join(path.dirname(npmCommand), 'node_modules', 'npm', 'bin', 'npm-cli.js')] : [])];
  let npmCli = null;
  for (const candidate of candidates) if (await fs.stat(candidate).then(info => info.isFile(), () => false)) { npmCli = candidate; break; }
  if (!npmCli) throw new Error('npm CLI could not be located beside Node/npm. Install Node.js LTS with npm.');
  const codex = await locateCommand(process.platform === 'win32' ? 'codex.exe' : 'codex');
  if (!codex) throw new Error('Codex is not on PATH. Install/open Codex Desktop and add its supported CLI to PATH before registration.');
  for (const dependency of ['@modelcontextprotocol/server','@modelcontextprotocol/client','zod','tsx','typescript']) {
    if (!await fs.stat(path.join(projectDir,'node_modules',dependency,'package.json')).then(info => info.isFile(), () => false)) throw new Error(`Missing ${dependency}. Run npm ci first.`);
  }
  const npmVersion = (await executeFile(process.execPath, [npmCli, '--version'], { cwd: projectDir, timeout: 20000, windowsHide: true })).stdout.trim();
  const codexVersion = (await executeFile(codex, ['--version'], { cwd: projectDir, timeout: 20000, windowsHide: true })).stdout.trim();
  console.log(`Windows user: ${os.userInfo().username}\nProject: ${projectDir}\nNode: ${process.execPath} (${process.version})\nnpm: ${npmVersion}\nCodex: ${codex} (${codexVersion})`);
  console.log('Building TypeScript project...');
  const build = await executeFile(process.execPath, [npmCli,'run','build'], { cwd: projectDir, timeout: 120000, windowsHide: true, maxBuffer: 4_000_000 });
  if (build.stdout.trim()) console.log(build.stdout.trim());
  console.log('Checking MCP STDIO startup, discovery, and harmless calls...');
  const smoke = await executeFile(process.execPath, [path.join(projectDir,'node_modules','tsx','dist','cli.mjs'),path.join(projectDir,'scripts','smoke.ts')], { cwd: projectDir, timeout: 120000, windowsHide: true, maxBuffer: 4_000_000 });
  if (smoke.stdout.trim()) console.log(smoke.stdout.trim());
  return { nodePath: process.execPath, npmCli, codex };
}

export async function main(argv = process.argv.slice(2)) {
  let apply = false;
  let configPath = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') apply = true;
    else if (argv[i] === '--config-path' && argv[i + 1]) configPath = path.resolve(argv[++i]);
    else throw new Error('Usage: node scripts/register-codex.mjs [--apply] [--config-path ABSOLUTE_PATH]');
  }
  const projectDir = await fs.realpath(path.resolve(path.dirname(modulePath), '..'));
  const installation = await verifyInstallation(projectDir);
  const serverConfig = JSON.parse(await fs.readFile(path.join(projectDir, 'config.json'), 'utf8'));
  const passwordEnvNames = Object.values(serverConfig.databases ?? {}).map(database => database.passwordEnv).filter(Boolean);
  const plan = await prepareRegistration({ projectDir, configPath, nodePath: installation.nodePath, passwordEnvNames });
  const previewPath = path.join(projectDir, 'documentation', 'codex-registration.toml');
  await fs.mkdir(path.dirname(previewPath), { recursive: true });
  await fs.writeFile(previewPath, plan.snippet, 'utf8');
  console.log(`\nConfiguration target: ${plan.configPath}\nThe following table will be appended; all existing text is preserved:\n\n${plan.snippet}\nPreview saved: ${previewPath}`);
  if (!apply) { console.log('\nPreview only. No Codex configuration changed. Run again with --apply when ready.'); return; }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Apply requires an interactive local terminal for the separate REGISTER confirmation.');
  const result = await applyRegistration(plan, { confirm: async () => {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await terminal.question(`\nModify ${plan.configPath} and create a backup? Type REGISTER exactly to authorize: `)).trim(); } finally { terminal.close(); }
  } });
  console.log(result.applied ? `Registered. Backup: ${result.backupPath ?? '(new configuration)'}\nFully quit and restart Codex Desktop, then confirm windows_laptop appears in MCP settings. Test system_get_info and filesystem_list.` : result.reason);
}

if (process.argv[1] && equivalent(path.resolve(process.argv[1]), path.resolve(modulePath))) {
  main().catch(error => { console.error(`Registration failed: ${error.message}`); process.exitCode = 1; });
}
