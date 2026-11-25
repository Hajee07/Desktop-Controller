import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config/index.js';
import { createContext } from './server/context.js';
import { createServer } from './server/index.js';
const projectDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try {
  if(process.platform!=='win32')throw new Error('Windows 11 is required');
  const config=await loadConfig(projectDir,process.env.WINDOWS_MCP_CONFIG);
  process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(config.stateDir,'browsers');
  const ctx=await createContext(config,projectDir);
  const handle=serveStdio(()=>createServer(ctx),{onerror:()=>process.stderr.write('MCP transport error\n')});
  const shutdown=async()=>{await handle.close();await ctx.shutdown();};
  process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());
  process.stdin.once('end',()=>void ctx.shutdown());
}catch(error:any){process.stderr.write(`Windows Laptop MCP startup failed: ${error.message}\n`);process.exitCode=1;}
