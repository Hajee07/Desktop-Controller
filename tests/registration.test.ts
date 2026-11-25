import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import TOML from '@iarna/toml';
import { prepareRegistration, applyRegistration, assertSafeConfigPath } from '../scripts/register-codex.mjs';

async function fixture(t: any, content?: string) {
  const owned = path.resolve('.state');
  await fs.mkdir(owned, { recursive: true });
  const directory = await fs.mkdtemp(path.join(owned, 'registration-test-'));
  t.after(async () => { assert.ok(path.resolve(directory).startsWith(`${owned}${path.sep}`)); await fs.rm(directory, { recursive: true, force: true }); });
  const configPath = path.join(directory, 'config.toml');
  if (content !== undefined) await fs.writeFile(configPath, content);
  return { directory, configPath, async prepare() { return prepareRegistration({ projectDir: process.cwd(), nodePath: process.execPath, configPath }); } };
}

test('Registration preview uses concrete local STDIO paths and preserves existing configuration bytes', async t => {
  const original = '# Keep this comment\r\nmodel = "example"\r\n[mcp_servers.existing]\r\ncommand = "existing.exe"\r\nargs = ["--stdio"]\r\n';
  const f = await fixture(t, original);
  const plan = await f.prepare();
  assert.equal(await fs.readFile(f.configPath, 'utf8'), original);
  assert.ok(plan.content.startsWith(original));
  assert.doesNotMatch(plan.snippet, /ABSOLUTE_PATH|PLACEHOLDER/);
  const parsed = TOML.parse(plan.content) as any;
  assert.equal(parsed.model, 'example');
  assert.equal(parsed.mcp_servers.existing.command, 'existing.exe');
  assert.equal(parsed.mcp_servers.windows_laptop.command, await fs.realpath(process.execPath));
  assert.deepEqual(parsed.mcp_servers.windows_laptop.args, [path.join(await fs.realpath(process.cwd()), 'dist', 'index.js')]);
  assert.equal(parsed.mcp_servers.windows_laptop.default_tools_approval_mode, 'prompt');
  assert.equal(parsed.mcp_servers.windows_laptop.startup_timeout_sec, 30);
  assert.equal(parsed.mcp_servers.windows_laptop.tool_timeout_sec, 120);
  assert.equal(parsed.mcp_servers.windows_laptop.env.PLAYWRIGHT_BROWSERS_PATH, path.join(await fs.realpath(process.cwd()), '.state', 'browsers'));
});

test('Registration refusal and cancellation leave configuration and directory unchanged', async t => {
  const original = 'model = "keep"\n';
  const f = await fixture(t, original);
  const beforeFiles = await fs.readdir(f.directory);
  const plan = await f.prepare();
  for (const response of ['','register','no','REGISTER later']) {
    const result = await applyRegistration(plan, { confirm: async () => response });
    assert.equal(result.applied, false);
  }
  assert.equal(await fs.readFile(f.configPath, 'utf8'), original);
  assert.deepEqual(await fs.readdir(f.directory), beforeFiles);
});

test('Registration forwards only configured database environment names, never credential values', async t => {
  const f = await fixture(t, 'model = "keep"\n');
  const plan = await prepareRegistration({ projectDir: process.cwd(), configPath: f.configPath, passwordEnvNames: ['PROJECT_DB_PASSWORD','PROJECT_DB_PASSWORD'] });
  const parsed = TOML.parse(plan.snippet) as any;
  assert.deepEqual(parsed.mcp_servers.windows_laptop.env_vars, ['PROJECT_DB_PASSWORD']);
  assert.equal(parsed.mcp_servers.windows_laptop.env.PROJECT_DB_PASSWORD, undefined);
  await assert.rejects(prepareRegistration({ projectDir: process.cwd(), configPath: f.configPath, passwordEnvNames: ['invalid-name'] }), /environment names/);
});

test('Approved isolated registration backs up exact old bytes and atomically appends only its table', async t => {
  const original = '\uFEFF# private configuration preserved without printing\nmodel = "keep"\n[mcp_servers.other]\ncommand = "other.exe"\n';
  const f = await fixture(t, original);
  const plan = await f.prepare();
  const result = await applyRegistration(plan, { confirm: async () => 'REGISTER' });
  assert.equal(result.applied, true);
  assert.equal(await fs.readFile(result.backupPath, 'utf8'), original);
  assert.equal(await fs.readFile(f.configPath, 'utf8'), plan.content);
  assert.equal((await fs.stat(f.configPath)).nlink, 1);
  assert.ok(!(await fs.readdir(f.directory)).some(name => name.endsWith('.lock') || name.endsWith('.tmp')));
  await assert.rejects(f.prepare(), /already exists/);
});

test('Existing registration, malformed TOML, and inline frozen server tables fail without mutation', async t => {
  for (const content of ['[mcp_servers.windows_laptop]\ncommand = "keep.exe"\n', 'broken = [\n', 'mcp_servers = { other = {command="keep"} }\n']) {
    const f = await fixture(t, content);
    await assert.rejects(f.prepare());
    assert.equal(await fs.readFile(f.configPath, 'utf8'), content);
  }
});

test('Concurrent content and file-identity changes abort before replacement', async t => {
  const f = await fixture(t, 'model = "before"\n');
  const plan = await f.prepare();
  await fs.writeFile(f.configPath, 'model = "new editor content"\n');
  await assert.rejects(applyRegistration(plan, { confirm: async () => 'REGISTER' }), /changed after preview/);
  assert.equal(await fs.readFile(f.configPath, 'utf8'), 'model = "new editor content"\n');
  assert.deepEqual(await fs.readdir(f.directory), ['config.toml']);

  const second = await f.prepare();
  const replacement = path.join(f.directory, 'replacement.toml');
  await fs.writeFile(replacement, await fs.readFile(f.configPath));
  await fs.rename(replacement, f.configPath);
  await assert.rejects(applyRegistration(second, { confirm: async () => 'REGISTER' }), /changed after preview/);
});

test('New configuration creates no directories until explicit approval and refuses concurrent creation', async t => {
  const f = await fixture(t);
  const nestedPath = path.join(f.directory, 'new-parent', 'config.toml');
  const plan = await prepareRegistration({ projectDir: process.cwd(), configPath: nestedPath });
  assert.equal(await fs.stat(path.dirname(nestedPath)).then(() => true, () => false), false);
  await applyRegistration(plan, { confirm: async () => 'NO' });
  assert.equal(await fs.stat(path.dirname(nestedPath)).then(() => true, () => false), false);
  const result = await applyRegistration(plan, { confirm: async () => 'REGISTER' });
  assert.equal(result.backupPath, null);
  assert.equal((await fs.stat(nestedPath)).nlink, 1);
  const f2 = await fixture(t);
  const second = await f2.prepare();
  await fs.writeFile(f2.configPath, 'model = "concurrent"');
  await assert.rejects(applyRegistration(second, { confirm: async () => 'REGISTER' }), /changed after preview/);
  assert.equal(await fs.readFile(f2.configPath, 'utf8'), 'model = "concurrent"');
});

test('Registration refuses hard-linked config files and symlink/junction parents', async t => {
  const f = await fixture(t, 'model = "original"\n');
  const hardlink = path.join(f.directory, 'linked.toml');
  await fs.link(f.configPath, hardlink);
  await assert.rejects(f.prepare(), /hard link/);
  await fs.unlink(hardlink);
  const realParent = path.join(f.directory, 'real');
  const aliasParent = path.join(f.directory, 'alias');
  await fs.mkdir(realParent);
  await fs.symlink(realParent, aliasParent, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(assertSafeConfigPath(path.join(aliasParent, 'config.toml')), /symlinks|junctions|aliases/);
  assert.equal(await fs.readFile(f.configPath, 'utf8'), 'model = "original"\n');
});

test('A registration lock prevents parallel installers from replacing configuration', async t => {
  const f = await fixture(t, 'model = "keep"\n');
  const plan = await f.prepare();
  await fs.writeFile(`${f.configPath}.windows-laptop-registration.lock`, 'another installer');
  await assert.rejects(applyRegistration(plan, { confirm: async () => 'REGISTER' }), /Another registration/);
  assert.equal(await fs.readFile(f.configPath, 'utf8'), 'model = "keep"\n');
});

test('Opt-in installed Codex parses registration using isolated CODEX_HOME', async t => {
  if (process.env.CODEX_REGISTRATION_LIVE_TESTS !== '1') return t.skip('Set CODEX_REGISTRATION_LIVE_TESTS=1 to test the installed Codex CLI with a disposable CODEX_HOME.');
  const f = await fixture(t);
  const plan = await f.prepare();
  await fs.writeFile(f.configPath, plan.snippet);
  const codexPath = process.platform === 'win32'
    ? execFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows','System32','where.exe'), ['codex.exe'], { encoding:'utf8' }).trim().split(/\r?\n/)[0]
    : 'codex';
  const options = { encoding: 'utf8' as const, timeout: 30000, windowsHide: true, env: { ...process.env, CODEX_HOME: f.directory } };
  const listed = JSON.parse(execFileSync(codexPath, ['mcp','list','--json'], options));
  assert.ok(listed.some((entry: any) => entry.name === 'windows_laptop'));
  const server = JSON.parse(execFileSync(codexPath, ['mcp','get','windows_laptop','--json'], options));
  assert.equal(server.name, 'windows_laptop');
  assert.equal(server.transport.type, 'stdio');
  assert.equal(server.transport.command, plan.nodePath);
  assert.deepEqual(server.transport.args, [path.join(plan.projectDir,'dist','index.js')]);
  // This CLI's get JSON omits approval policy fields; the TOML and official config schema establish that value.
  assert.equal((TOML.parse(await fs.readFile(f.configPath, 'utf8')) as any).mcp_servers.windows_laptop.default_tools_approval_mode, 'prompt');
});
