import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AppContext, ToolDefinition } from '../server/types.js';
import { executeCommand } from '../powershell/index.js';
export function developmentTools(ctx:AppContext):ToolDefinition[]{
  const schema=z.object({project:z.string().min(1),commandId:z.string().min(1).max(64),dryRun:z.boolean().default(true)}).strict();
  return [
    {name:'development_inspect',description:'Inspect project manifests for Node/React, Python, Java, Gradle/Android and Git without executing project code.',schema:z.object({project:z.string().min(1)}).strict(),readOnly:true,async execute(i){
      const root=await ctx.paths.check(i.project);const manifests:Record<string,string>={};
      for(const name of ['package.json','tsconfig.json','pyproject.toml','requirements.txt','pom.xml','build.gradle','build.gradle.kts','settings.gradle','settings.gradle.kts','gradle.properties']){
        try{const filename=await ctx.paths.check(path.join(root,name));if((await fs.stat(filename)).size<100000)manifests[name]=await fs.readFile(filename,'utf8');}catch(e:any){if(e.code!=='ENOENT')throw e;}
      }
      const commands=Object.keys(ctx.config.commands);
      return {project:root,manifests,configuredCommandIds:commands,note:'Scripts execute as this Windows user and can access that account. Only configure trusted scripts. Bind local web servers to 127.0.0.1.'};
    }},
    ...['development_run_project','development_run_tests','development_install_dependencies','development_git','development_debug'].map(name=>({name,description:'Preview or run a locally approved fixed command for this development task. Add exact executable/argv using the local configuration CLI. Time-bounded output is returned.',schema,readOnly:false,destructive:true,openWorld:true,async execute(i:any,c:any){return executeCommand(ctx,i.commandId,i.project,i.dryRun,c);}}))
  ];
}
