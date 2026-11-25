import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AppContext, ToolDefinition } from '../server/types.js';
import { reserveOutput } from '../storage/index.js';

export const spssPython = 'C:\\Program Files\\IBM\\SPSS\\Statistics\\27\\Python3\\python.exe';
const filePath = z.string().min(1).max(4096);
const variable = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const analysisInput = z.object({
  path: filePath,
  procedure: z.enum(['descriptives', 'frequencies', 'correlation', 'reliability', 'regression']),
  variables: z.array(variable).min(1).max(30),
  dependent: variable.optional(),
  outputPath: filePath,
  dryRun: z.boolean().default(true)
}).strict().refine(input => {
  const names = input.variables.map(name => name.toLowerCase());
  if (new Set(names).size !== names.length) return false;
  if (input.procedure === 'regression') return !!input.dependent && !names.includes(input.dependent.toLowerCase());
  if (input.dependent) return false;
  return !['correlation', 'reliability'].includes(input.procedure) || names.length >= 2;
}, 'Use distinct variable names. Correlation and reliability need two or more variables. Regression requires a separate dependent variable.');

async function dataset(ctx: AppContext, input: string) {
  const source = await ctx.paths.check(input, 'read');
  const info = await fs.stat(source);
  if (!/\.(?:sav|zsav)$/i.test(source) || !info.isFile() || info.size > ctx.config.maxReadBytes) {
    throw new Error('SPSS requires an authorized .sav or .zsav within the configured file size limit.');
  }
  return source;
}

async function run(ctx: AppContext, request: object, signal: AbortSignal) {
  ctx.emergency.assertRunning();
  const result = await ctx.runProcess(spssPython, ['-I', path.join(ctx.projectDir, 'scripts', 'spss-analysis.py'), JSON.stringify(request)], {
    cwd: ctx.projectDir, signal, timeoutMs: ctx.config.toolTimeoutMs
  });
  const prefix = 'MCP_SPSS_RESULT:';
  const reply = result.stdout.split(/\r?\n/).findLast(line => line.startsWith(prefix));
  if (!reply) throw new Error(`SPSS_BACKEND_NO_RESULT: process exited with code ${result.exitCode}`);
  const payload = JSON.parse(reply.slice(prefix.length));
  if (result.exitCode !== 0 || payload.error) throw new Error(`SPSS_ANALYSIS_FAILED: ${payload.error ?? result.exitCode}`);
  return payload;
}

export function spssAnalysisTools(ctx: AppContext): ToolDefinition[] {
  return [
    {
      name: 'spss_dataset_inspect',
      description: 'Read the variable dictionary and case count of an authorized SAV or ZSAV using IBM SPSS. Does not return individual records.',
      schema: z.object({ path: filePath, offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(200).default(100) }).strict(),
      readOnly: true,
      async execute(input, call) {
        const source = await dataset(ctx, input.path);
        return { path: source, ...await run(ctx, { action: 'inspect', source, offset: input.offset, limit: input.limit }, call.signal) };
      }
    },
    {
      name: 'spss_analysis_run',
      description: 'Preview or run native SPSS descriptives, frequencies, Pearson correlation, Cronbach alpha, or linear regression on an authorized SAV/ZSAV. Saves a new SPV without modifying the dataset or an existing file.',
      schema: analysisInput,
      readOnly: false,
      async execute(input, call) {
        const source = await dataset(ctx, input.path);
        const output = await ctx.paths.check(input.outputPath, 'write');
        if (!/\.spv$/i.test(output)) throw new Error('Output must end in .spv.');
        if (!(await fs.stat(path.dirname(output))).isDirectory()) throw new Error('Output folder must exist.');
        const existing = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
        if (existing) throw new Error('Choose a new output file.');
        const analysis = { procedure: input.procedure, variables: input.variables, dependent: input.dependent };
        if (input.dryRun) return { dryRun: true, source, output, ...analysis };

        const maximumBytes = Math.min(ctx.config.maxReadBytes, 64 * 1024 * 1024);
        const release = await reserveOutput(ctx, output, maximumBytes, call.signal);
        let directory: string | undefined;
        try {
          directory = await fs.mkdtemp(path.join(ctx.config.stateDir, 'spss-analysis-'));
          const destination = path.join(directory, 'result.spv');
          const result = await run(ctx, { action: 'analyze', source, destination, ...analysis }, call.signal);
          const info = await fs.stat(destination);
          if (!info.isFile() || info.size < 22 || info.size > maximumBytes) throw new Error('SPSS output is missing or exceeds the size limit.');
          const file = await fs.open(destination, 'r');
          try {
            const signature = Buffer.alloc(4);
            await file.read(signature, 0, 4, 0);
            if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('Invalid SPSS Viewer archive.');
          } finally { await file.close(); }
          const current = await ctx.paths.check(input.outputPath, 'write');
          call.signal.throwIfAborted();
          ctx.emergency.assertRunning();
          await fs.copyFile(destination, current, constants.COPYFILE_EXCL);
          return { source, output: current, bytes: info.size, ...analysis, ...result };
        } finally {
          release();
          if (directory) {
            await fs.unlink(path.join(directory, 'result.spv')).catch(() => {});
            await fs.rmdir(directory).catch(() => {});
          }
        }
      }
    }
  ];
}
