import fs from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import path from 'node:path';
export class EmergencyStop {
  private stopped=false;
  private stopping:Promise<void>|undefined;
  private hooks:(()=>Promise<void>)[]=[];
  private controllers=new Set<AbortController>();
  private watcher;
  constructor(private stateDir:string){this.stopped=existsSync(path.join(stateDir,'STOP'));this.watcher=watch(stateDir,(_event,name)=>{if(name==='STOP'&&existsSync(path.join(stateDir,'STOP')))void this.stop();});this.watcher.unref();}
  assertRunning():void {if(this.stopped||existsSync(path.join(this.stateDir,'STOP')))throw new Error('EMERGENCY_STOP: run configure --resume locally to resume');}
  onStop(fn:()=>Promise<void>):void {this.hooks.push(fn);}
  track(c:AbortController):()=>void {this.assertRunning();this.controllers.add(c);return()=>this.controllers.delete(c);}
  stop():Promise<void>{
    if(this.stopping)return this.stopping;
    this.stopped=true;
    this.stopping=(async()=>{for(const c of this.controllers)c.abort();if(!existsSync(path.join(this.stateDir,'STOP')))await fs.writeFile(path.join(this.stateDir,'STOP'),'Stopped by user. Resume only from local configuration CLI.\n',{flag:'wx'}).catch((e:any)=>{if(e.code!=='EEXIST')throw e;});await Promise.allSettled(this.hooks.map(fn=>fn()));})();
    return this.stopping;
  }
  close():void {this.watcher.close();}
  async dispose():Promise<void>{this.stopped=true;this.watcher.close();for(const c of this.controllers)c.abort();await Promise.allSettled(this.hooks.map(fn=>fn()));}
}
