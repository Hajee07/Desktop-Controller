import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../server/types.js';

export async function discoverInstallation(ctx: AppContext) {
  const candidates = [
    ctx.config.applications.spss?.executable && path.dirname(ctx.config.applications.spss.executable),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'IBM', 'SPSS', 'Statistics', '27'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'IBM', 'SPSS', 'Statistics', '27')
  ].filter((value): value is string => !!value);
  for (const directory of [...new Set(candidates)]) {
    try {
      if ((await fs.realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase()) continue;
      const python = path.join(directory, 'Python3', 'python.exe');
      if (!(await fs.stat(python)).isFile()) continue;
      const product = await fs.readFile(path.join(directory, 'spssprod.inf'), 'utf8');
      const version = /^Version=(.*)$/m.exec(product)?.[1].trim();
      if (!version?.startsWith('27.')) continue;
      const commands = (await fs.readdir(path.join(directory, 'syntax_xml'))).filter(name => name.endsWith('.xml')).map(name => name.slice(0, -4).toUpperCase());
      return { directory, python, version, commands: commands.sort(), product: 'IBM SPSS Statistics 27' };
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('SPSS_27_NOT_INSTALLED: no compatible installation with bundled Python was detected');
}

export class SpssConnection {
  private child?: ChildProcessWithoutNullStreams;
  private tail: Promise<unknown> = Promise.resolve();
  private pending?: { id: string; resolve(value: any): void; reject(error: Error): void };
  private session?: string;
  private generation = 0;
  constructor(private ctx: AppContext) {
    ctx.emergency.onStop(async () => this.close());
  }

  get currentSession() { return this.session; }
  get health() { return { sessionId: this.session ?? null, connected: !!this.child, pid: this.child?.pid ?? null, busy: !!this.pending }; }

  private async start(session: string) {
    if (this.child && this.session === session) return;
    if (this.child) throw new Error('SPSS_SESSION_ACTIVE: stop the current owned session before switching');
    const installation = await discoverInstallation(this.ctx);
    const root = path.join(this.ctx.config.stateDir, `spss-${session}`);
    await fs.mkdir(root, { recursive: true });
    const info = await fs.lstat(root);
    if (info.isSymbolicLink() || (await fs.realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error('SPSS_STATE_PATH_UNSAFE');
    const child = spawn(installation.python, ['-I', path.join(this.ctx.projectDir, 'scripts', 'spss-engine.py'), root], {
      cwd: this.ctx.projectDir, shell: false, windowsHide: true, stdio: 'pipe',
      env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value && /^(SystemRoot|WINDIR|SystemDrive|COMSPEC|TEMP|TMP|PATH|PATHEXT|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(key)))
    });
    this.child = child;
    this.session = session;
    const generation = ++this.generation;
    const reader = createInterface({ input: child.stdout });
    reader.on('line', line => {
      if (generation !== this.generation || !line.startsWith('MCP_SPSS:')) return;
      try {
        if (Buffer.byteLength(line) > 2_000_000) throw new Error('SPSS_RESPONSE_LIMIT');
        const reply = JSON.parse(line.slice(9));
        if (!this.pending || reply.id !== this.pending.id) return;
        const pending = this.pending;
        this.pending = undefined;
        if (reply.ok) pending.resolve(reply.result);
        else pending.reject(new Error(reply.error));
      } catch (error: any) { this.pending?.reject(error); this.close(); }
    });
    child.stderr.on('data', () => {});
    const disconnected = () => {
      reader.close();
      if (this.child !== child) return;
      this.child = undefined;
      const pending = this.pending;
      this.pending = undefined;
      pending?.reject(new Error('SPSS_CONNECTION_LOST: recover the last checkpoint and inspect execution history before retrying'));
    };
    child.once('error', disconnected);
    child.once('exit', disconnected);
  }

  call(session: string, payload: Record<string, unknown>, signal: AbortSignal): Promise<any> {
    const run = async () => {
      signal.throwIfAborted();
      this.ctx.emergency.assertRunning();
      await this.start(session);
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        const id = randomUUID();
        const cancel = () => this.close(new Error('SPSS_CANCELLED_OR_TIMEOUT: inspect checkpoints before retrying'));
        const timer = setTimeout(cancel, this.ctx.config.toolTimeoutMs);
        signal.addEventListener('abort', cancel, { once: true });
        const finish = (callback: (value: any) => void, value: any) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
          callback(value);
        };
        this.pending = { id, resolve: value => finish(resolve, value), reject: error => finish(reject, error) };
        this.child!.stdin.write(JSON.stringify({ ...payload, id }) + '\n', error => {
          if (error) this.close(error);
        });
      });
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => {});
    return result;
  }

  close(error = new Error('SPSS_SESSION_STOPPED')) {
    const child = this.child;
    this.child = undefined;
    this.generation++;
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(error);
    if (child) {
      child.stdin.end();
      if (child.pid) {
        const killer = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      }
    }
  }
}
