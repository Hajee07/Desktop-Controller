import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AppConfig } from '../server/types.js';
import { AuthorizedPaths, isWithin } from '../security/paths.js';
import {storageSchema} from '../storage/index.js';
import { MAX_FILE_BYTES } from '../utils/files.js';

const localPath = z.string().min(3).max(4096).refine(p => path.isAbsolute(p) && !p.startsWith('\\\\'), 'Absolute local path required');
const hasCredentialArgument=(args:string[])=>args.some(a=>/^--?(?:password|passwd|token|api[-_]?key|secret)(?:=|$)/i.test(a)||/^(?:PGPASSWORD|MYSQL_PWD|\w*(?:TOKEN|SECRET|API_KEY))=/i.test(a));
const commandArgs=z.array(z.string().max(4096)).max(100).refine(args=>!hasCredentialArgument(args),'Credentials cannot be embedded in command argv; use the named database password environment integration');
export const configSchema = z.object({
  pythonExecutable:localPath.optional(),
  storage:storageSchema.optional(),
  permissions:z.object({automaticWorkspaceEdits:z.boolean().default(false),automaticCapture:z.boolean().default(false),automaticWordRoots:z.array(localPath).max(32).optional(),automaticAuthorizedRootEdits:z.boolean().optional()}).strict().optional(),
  version: z.literal(1), authorizedRoots: z.array(localPath).min(1).max(32), stateDir: localPath,
  maxDocumentProcessingBytes:z.number().int().min(1024).max(512*1024*1024).default(256*1024*1024),
  maxReadBytes: z.number().int().min(1024).max(MAX_FILE_BYTES).default(5_000_000),
  applicationLaunchPolicy:z.object({automaticApproved:z.boolean().default(false),allowInstalled:z.boolean().default(false)}).strict().optional(),
  maxOfficeArchiveBytes: z.number().int().min(1024).max(MAX_FILE_BYTES).default(MAX_FILE_BYTES),
  maxOfficeXmlBytes: z.number().int().min(1024).max(256*1024*1024).default(40*1024*1024),
  maxSearchEntries: z.number().int().min(1).max(100_000).default(10_000),
  toolTimeoutMs: z.number().int().min(1000).max(110_000).default(90_000),
  applications: z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), z.object({ executable: localPath, args: z.array(z.string().max(4096)).max(30).default([]), processNames: z.array(z.string().regex(/^[\w .-]+$/)).min(1) }).strict()).default({}),
  desktop: z.object({enabled:z.boolean().default(false), captureEnabled:z.boolean().optional(), allowedProcesses:z.array(z.string().regex(/^[\w .-]+$/)).default([]),presenceMaxIdleSeconds:z.number().int().min(5).max(300).default(120)}).strict().default({enabled:false,allowedProcesses:[],presenceMaxIdleSeconds:120}),
  browser: z.object({enabled:z.boolean().default(true),allowedOrigins:z.array(z.union([z.string().url(),z.literal('*')])).default(['http://localhost:3000','http://127.0.0.1:3000']),headless:z.boolean().default(false)}).strict().default({enabled:true,allowedOrigins:['http://localhost:3000','http://127.0.0.1:3000'],headless:false}),
  commands: z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), z.object({executable:localPath,args:commandArgs,description:z.string().min(1).max(1000),requiresConfirmation:z.boolean().default(true),allowNetwork:z.boolean().default(false)}).strict()).default({}),
  databases: z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), z.object({driver:z.enum(['sqlite','mysql','postgres']),path:localPath.optional(),host:z.string().max(253).optional(),port:z.number().int().min(1).max(65535).optional(),database:z.string().max(128).optional(),user:z.string().max(128).optional(),passwordEnv:z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),allowWrite:z.boolean().default(false)}).strict()).default({})
}).strict();
export function defaultConfig(projectDir: string): AppConfig {
  return configSchema.parse({version:1,authorizedRoots:[path.join(projectDir,'workspace')],stateDir:path.join(projectDir,'.state'),applications:{notepad:{executable:path.join(process.env.SystemRoot ?? 'C:\\Windows','System32','notepad.exe'),args:[],processNames:['notepad']}},commands:{'node-version':{executable:process.execPath,args:['--version'],description:'Show Node.js version',requiresConfirmation:false,allowNetwork:false}}});
}
export async function loadConfig(projectDir: string, file = path.join(projectDir,'config.json')): Promise<AppConfig> {
  const cfg = configSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));
  const state = path.join(projectDir,'.state');
  if (path.resolve(cfg.stateDir).toLowerCase() !== state.toLowerCase()) throw new Error('Configuration stateDir must be the project .state directory');
  for (const root of cfg.authorizedRoots) {
    const real = await fs.realpath(root);
    if (path.resolve(root).toLowerCase() !== real.toLowerCase()) throw new Error('Authorized roots cannot be aliases');
    if (isWithin(state,root)) throw new Error('Authorized roots cannot be inside server state');
    await new AuthorizedPaths([real]).check(real);
  }
  for (const root of cfg.permissions?.automaticWordRoots ?? []) {
    await new AuthorizedPaths(cfg.authorizedRoots).check(root);
    if (!(await fs.stat(root)).isDirectory()) throw new Error('Automatic Word roots must be authorized directories');
  }
  for (const origin of cfg.browser.allowedOrigins) {
    if(origin==='*')continue;
    const url = new URL(origin);
    if (!['https:','http:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('Browser allowlist must contain exact HTTP(S) origins');
  }
  for (const cmd of Object.values(cfg.commands)) {
    if (!/\.exe$/i.test(cmd.executable) || /[\r\n\x00]/.test(cmd.executable)) throw new Error('Command allowlist requires absolute .exe paths; run npm/tsx/gradle through their approved executable and fixed script arguments');
  }
  return cfg;
}
