import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { defaultConfig,configSchema,loadConfig } from '../src/config/index.js';
import { AuthorizedPaths } from '../src/security/paths.js';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(project,'config.json');
const [option,value]=process.argv.slice(2);
if(option==='--init'){
  await fs.mkdir(path.join(project,'workspace'),{recursive:true});
  await fs.mkdir(path.join(project,'.state'),{recursive:true});
  const config=defaultConfig(project);
  await fs.writeFile(path.join(project,'config.example.json'),JSON.stringify(config,null,2)+'\n');
  try{await fs.writeFile(file,JSON.stringify(config,null,2)+'\n',{flag:'wx'});stdout.write(`Created ${file}\nAuthorized root: ${config.authorizedRoots[0]}\n`);}catch(e:any){if(e.code!=='EEXIST')throw e;stdout.write('Existing configuration preserved.\n');}
}else if(option==='--resume'){
  const rl=createInterface({input:stdin,output:stdout});try{if(await rl.question('Clear the emergency stop? Type RESUME: ')==='RESUME'){await fs.unlink(path.join(project,'.state','STOP')).catch((e:any)=>{if(e.code!=='ENOENT')throw e;});stdout.write('Emergency stop cleared. Restart the MCP server.\n');}}finally{rl.close();}
}else if(option==='--show'){
  const c=await loadConfig(project);stdout.write(JSON.stringify({authorizedRoots:c.authorizedRoots,applications:Object.keys(c.applications),desktop:c.desktop,browser:c.browser,commands:Object.keys(c.commands),databases:Object.keys(c.databases)},null,2)+'\n');
}else if(['--add-root','--add-origin','--enable-desktop','--add-application','--add-command','--add-database'].includes(option)){
  if(!value)throw new Error('This option requires an argument. Run configure without arguments for usage.');
  const original=await fs.readFile(file,'utf8');const c=configSchema.parse(JSON.parse(original));
  if(option==='--add-root'){const root=await fs.realpath(value);await new AuthorizedPaths([root]).check(value);if(!c.authorizedRoots.includes(root))c.authorizedRoots.push(root);}
  if(option==='--add-origin'){const u=new URL(value);if(u.origin!==value||!['http:','https:'].includes(u.protocol))throw new Error('Provide an exact HTTP(S) origin without a trailing slash.');if(!c.browser.allowedOrigins.includes(value))c.browser.allowedOrigins.push(value);}
  if(option==='--enable-desktop'){if(!Object.values(c.applications).some(a=>a.processNames.includes(value)))throw new Error('Authorize an application with this process name first.');c.desktop.enabled=true;if(!c.desktop.allowedProcesses.includes(value))c.desktop.allowedProcesses.push(value);}
  if(['--add-application','--add-command','--add-database'].includes(option)){
    const entry=JSON.parse(await fs.readFile(path.resolve(value),'utf8'));const {id,...settings}=entry;if(typeof id!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(id))throw new Error('Integration JSON requires a valid id.');
    if(option==='--add-application')c.applications[id]=settings;
    if(option==='--add-command')c.commands[id]=settings;
    if(option==='--add-database')c.databases[id]=settings;
  }
  const validated=configSchema.parse(c);const next=JSON.stringify(validated,null,2)+'\n';
  stdout.write(`Configuration change:\n${next}\nThis grants the server the listed local capabilities. Scripts run as your Windows account; directory and network restrictions do not sandbox child scripts.\n`);
  const rl=createInterface({input:stdin,output:stdout});try{
    if(await rl.question('Type AUTHORIZE to save: ')==='AUTHORIZE'){
      if(await fs.readFile(file,'utf8')!==original)throw new Error('Configuration changed during review; rerun.');
      await fs.copyFile(file,path.join(project,`config.backup-${Date.now()}.json`),1);await fs.writeFile(file,next);stdout.write('Saved. Restart the MCP server.\n');
    }else stdout.write('No configuration change applied.\n');
  }finally{rl.close();}
}else stdout.write(`Local configuration:\n  npm run configure -- --init\n  npm run configure -- --show\n  npm run configure -- --add-root "C:\\absolute\\folder"\n  npm run configure -- --add-origin "http://localhost:5173"\n  npm run configure -- --enable-desktop notepad\n  npm run configure -- --add-application application.json\n  npm run configure -- --add-command command.json\n  npm run configure -- --add-database database.json\n  npm run configure -- --resume\nIntegration JSON has an id plus the corresponding fields from config.example.json and documentation/SETUP.md.\n`);
