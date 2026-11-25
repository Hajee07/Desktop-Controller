import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
export class AuditLog {
  private db: DatabaseSync;
  private closed=false;
  private records=0;
  constructor(stateDir: string) {
    this.db = new DatabaseSync(path.join(stateDir,'audit.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2000; CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, tool TEXT NOT NULL, status TEXT NOT NULL, duration_ms INTEGER)');
  }
  record(tool: string, status: string, details: Record<string,unknown> = {}): void {
    if(this.closed)return;
    // Deliberately do not persist arguments, paths, SQL, URLs, text, command output, or errors.
    this.db.prepare('INSERT INTO audit(at,tool,status,duration_ms) VALUES(?,?,?,?)').run(new Date().toISOString(),tool.replace(/[^a-z0-9_-]/gi,'').slice(0,80),['started','ok','error','denied','stopped'].includes(status)?status:'error',typeof details.durationMs === 'number' ? Math.round(details.durationMs):null);
  }
  list(limit: number): unknown[] {return this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(Math.max(1,Math.min(1000,limit)));}
  close(): void {if(!this.closed){this.closed=true;this.db.close();}}
}
