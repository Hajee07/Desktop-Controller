import type {ManagedStorage} from '../storage/index.js';
import type { z } from 'zod';

export interface AppConfig {
  storage?:{quotaBytes?:number;minFreeBytes?:number;categoryBytes?:{documents:number;images:number;research:number;temporary:number;history:number;reserved:number}};
  permissions?:{automaticWorkspaceEdits:boolean;automaticCapture?:boolean;automaticWordRoots?:string[];automaticAuthorizedRootEdits?:boolean};
  pythonExecutable?:string;
  version: 1;
  authorizedRoots: string[];
  stateDir: string;
  maxReadBytes: number;
  maxDocumentProcessingBytes?:number;
  applicationLaunchPolicy?:{automaticApproved:boolean;allowInstalled:boolean};
  maxOfficeArchiveBytes?: number;
  maxOfficeXmlBytes?: number;
  maxSearchEntries: number;
  toolTimeoutMs: number;
  applications: Record<string, { executable: string; args: string[]; processNames: string[] }>;
  desktop: { enabled: boolean; captureEnabled?:boolean; allowedProcesses: string[]; presenceMaxIdleSeconds: number };
  browser: { enabled: boolean; allowedOrigins: string[]; headless: boolean };
  commands: Record<string, { executable: string; args: string[]; description: string; requiresConfirmation: boolean; allowNetwork: boolean }>;
  databases: Record<string, { driver: 'sqlite'|'mysql'|'postgres'; path?: string; host?: string; port?: number; database?: string; user?: string; passwordEnv?: string; allowWrite: boolean }>;
}
export interface CallContext {
  progress?(completed:number,total:number,message:string):Promise<void>;
  signal: AbortSignal;
  confirm(title: string, details: string): Promise<void>;
}
export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  readOnly: boolean;
  destructive?: boolean;
  openWorld?: boolean;
  execute(input: any, call: CallContext): Promise<unknown>;
}
export interface PathPolicy {
  check(input: string, mode?: 'read'|'write'): Promise<string>;
  isRoot(input: string): boolean;
}
export interface AppContext {
  storage?:ManagedStorage;
  config: AppConfig;
  projectDir: string;
  paths: PathPolicy;
  backup(path: string): Promise<string | null>;
  runPowerShell(operation: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<any>;
  runProcess(executable: string, args: string[], options: { cwd?: string; signal?: AbortSignal; timeoutMs?: number; allowNetwork?: boolean }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  audit: { record(tool: string, status: string, details?: Record<string, unknown>): void; list(limit: number): unknown[] };
  emergency: { assertRunning(): void; stop(): Promise<void>; onStop(fn: () => Promise<void>): void };
}
