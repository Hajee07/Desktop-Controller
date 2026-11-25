import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultConfig } from '../src/config/index.js';
import { createContext } from '../src/server/context.js';
import { officeTools } from '../src/office/index.js';
import { OfficeWorker } from '../src/office/worker.js';
import { isTrustedWorkspace } from '../src/security/workspace-trust.js';
import { filesystemTools } from '../src/filesystem/index.js';
import { createHash } from 'node:crypto';

test('authorized-root trust performs a real backed-up edit and preserves boundaries', async () => {
  const base = path.resolve('test-results');
  await fs.mkdir(base, { recursive: true });
  const project = await fs.mkdtemp(path.join(base, 'all-roots-trust-'));
  const root = path.join(project, 'approved');
  await fs.mkdir(root);
  const config = defaultConfig(project);
  config.authorizedRoots = [root];
  config.permissions = { automaticWorkspaceEdits: true, automaticAuthorizedRootEdits: true };
  const ctx = await createContext(config, project);
  try {
    const file = path.join(root, 'code.txt');
    await fs.writeFile(file, 'original');
    assert.equal(isTrustedWorkspace(ctx, file), true);
    assert.equal(isTrustedWorkspace(ctx, path.join(project, 'approved-other', 'file.txt')), false);
    const tool = filesystemTools(ctx).find(tool => tool.name === 'filesystem_edit')!;
    const input = tool.schema.parse({ path: file, content: 'updated', expectedSha256: createHash('sha256').update('original').digest('hex'), dryRun: false });
    const result = await tool.execute(input, { signal: new AbortController().signal, confirm: async () => { throw new Error('Unexpected approval'); } }) as any;
    assert.equal(await fs.readFile(file, 'utf8'), 'updated');
    assert.equal(await fs.readFile(result.backup, 'utf8'), 'original');
    config.permissions.automaticAuthorizedRootEdits = false;
    assert.equal(isTrustedWorkspace(ctx, file), false);
  } finally {
    await ctx.shutdown();
    assert.equal(path.dirname(await fs.realpath(project)), base);
    await fs.rm(project, { recursive: true, force: true });
  }
});

test('folder-specific Word trust keeps checkpoint, revision, backup and sibling approval boundaries', async () => {
  const base = path.resolve('test-results');
  await fs.mkdir(base, { recursive: true });
  const project = await fs.mkdtemp(path.join(base, 'word-trust-'));
  const root = path.join(project, 'files');
  const trusted = path.join(root, 'Mathes');
  const sibling = path.join(root, 'MathesOther');
  await fs.mkdir(trusted, { recursive: true });
  await fs.mkdir(sibling);
  const file = path.join(trusted, 'fixture.docx');
  await fs.writeFile(file, 'owned backup fixture bytes');
  await fs.writeFile(path.join(sibling, 'fixture.docx'), 'owned sibling bytes');
  const config = defaultConfig(project);
  config.authorizedRoots = [root];
  config.permissions = { automaticWorkspaceEdits: false, automaticWordRoots: [trusted] };
  const ctx = await createContext(config, project);
  const original = OfficeWorker.prototype.call;
  let edits = 0;
  let saves = 0;
  const revision = 'a'.repeat(64);
  OfficeWorker.prototype.call = async function (payload) {
    if (payload.action === 'properties') return { revision, checkpointBytes: 100 };
    if (payload.action === 'edit') {
      assert.equal(payload.expectedRevision, revision);
      assert.equal(path.dirname(String(payload.checkpointPath)), path.join(config.stateDir, 'backups'));
      edits++;
      return { revision: 'b'.repeat(64) };
    }
    if (payload.action === 'save') { saves++; return { saved: true }; }
    throw new Error('Unexpected native test operation');
  };
  try {
    const tools = officeTools(ctx);
    let confirmations = 0;
    const call = { signal: new AbortController().signal, confirm: async () => { confirmations++; throw new Error('Approval required'); } };
    const invoke = async (name: string, input: object) => {
      const tool = tools.find(tool => tool.name === name)!;
      return tool.execute(tool.schema.parse(input), call);
    };
    const target = { path: file, documentId: 'c'.repeat(64), expectedRevision: revision };
    const edit = { ...target, requestKey: randomUUID(), operations: [{ kind: 'insert', start: 0, end: 0, text: 'test' }], dryRun: false };
    await invoke('word_edit_batch', edit);
    assert.equal(edits, 1);
    assert.equal(confirmations, 0);
    await assert.rejects(invoke('word_edit_batch', { ...edit, requestKey: randomUUID(), expectedRevision: '0'.repeat(64) }), /STALE_REVISION/);
    assert.equal(edits, 1);
    await invoke('word_save_document', target);
    assert.equal(saves, 1);
    const backups = (await fs.readdir(path.join(config.stateDir, 'backups'))).filter(name => name.endsWith('.bak'));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(config.stateDir, 'backups', backups[0]), 'utf8'), 'owned backup fixture bytes');
    await assert.rejects(invoke('word_edit_batch', { ...edit, path: path.join(sibling, 'fixture.docx'), requestKey: randomUUID() }), /Approval required/);
    await assert.rejects(invoke('word_save_document', { ...target, path: path.join(sibling, 'fixture.docx') }), /Approval required/);
    assert.equal(confirmations, 2);
    assert.equal(edits, 1);
    assert.equal(saves, 1);
  } finally {
    OfficeWorker.prototype.call = original;
    await ctx.shutdown();
    assert.equal(path.dirname(await fs.realpath(project)), base);
    await fs.rm(project, { recursive: true, force: true });
  }
});
