import path from 'node:path';
import fs from 'node:fs/promises';
import type { PathPolicy } from '../server/types.js';

const sensitive = /^(?:\.ssh|\.aws|\.azure|\.gnupg|\.codex|\.agents|\.git|\.kube|\.npmrc|\.pypirc|\.netrc|\.env(?:\..*)?|appdata|credentials?|credential manager|vault|browser profiles?|user data|login data|local state|cookies|web data|key[34]\.db|logins\.json|cert[89]\.db|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|pfx|p12|kdbx))$/i;
const reserved = /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i;
const systemFolder = /^(?:windows|program files(?: ?\(x86\))?|programdata|recovery|system volume information|\$recycle\.bin|boot)$/i;
export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export class AuthorizedPaths implements PathPolicy {
  constructor(readonly roots: string[], readonly protectedPaths: string[] = []) {}
  isRoot(input: string): boolean { return this.roots.some(r => path.resolve(r).toLowerCase() === path.resolve(input).toLowerCase()); }
  checkName(input: string): string {
    if (!input || !path.isAbsolute(input) || /[\x00-\x1f]/.test(input) || /^(?:\\\\|\/\/)/.test(input)) throw new Error('PATH_DENIED: absolute local paths are required');
    const rest = input.slice(path.parse(input).root.length);
    const parts = rest.split(/[\\/]/).filter(Boolean);
    if (parts.some(p => p === '.' || p === '..' || /[:*?"<>|]/.test(p) || /[. ]$/.test(p) || reserved.test(p) || sensitive.test(p) || systemFolder.test(p) || /^(?:passwords?|secrets?|credentials?|auth|tokens?)(?:[._ -]|$)/i.test(p) || /~\d/.test(p))) throw new Error('PATH_DENIED: unsafe or sensitive path');
    const target = path.resolve(input);
    if (!this.roots.some(root => isWithin(root, target)) || this.protectedPaths.some(p => isWithin(p, target))) throw new Error('PATH_DENIED: outside authorized directories');
    return target;
  }
  async check(input: string, mode: 'read'|'write' = 'read'): Promise<string> {
    const target = this.checkName(input);
    // Check every existing component. Reject all symlinks/junctions, including links remaining inside a root.
    let cursor = path.parse(target).root;
    let missing = false;
    for (const segment of target.slice(cursor.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      if (missing) continue;
      try {
        const st = await fs.lstat(cursor);
        if (st.isSymbolicLink() || (st.isFile() && st.nlink > 1)) throw new Error('PATH_DENIED: links are not authorized');
        const real = await fs.realpath(cursor);
        if (real.toLowerCase() !== path.resolve(cursor).toLowerCase()) throw new Error('PATH_DENIED: reparse point or alias');
      } catch (error: any) {
        if (error.code === 'ENOENT' && mode === 'write') missing = true;
        else throw error;
      }
    }
    return target;
  }
}
