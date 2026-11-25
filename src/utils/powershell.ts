import fs from 'node:fs/promises';
import path from 'node:path';

let selected: Promise<string> | undefined;

/** Use an installed PowerShell 7 (pwsh.exe) or Windows PowerShell (powershell.exe) without overriding the machine's execution policy. */
export function approvedPowerShell(): Promise<string> {
  return selected ??= (async () => {
    const entries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
    const candidates = [
      path.join('C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
      ...entries.map(entry => path.join(entry, 'pwsh.exe')),
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ...entries.map(entry => path.join(entry, 'powershell.exe'))
    ];
    for (const candidate of candidates) {
      if (!path.isAbsolute(candidate)) continue;
      try {
        const resolved = await fs.realpath(candidate);
        const name = path.basename(resolved).toLowerCase();
        if (name !== 'pwsh.exe' && name !== 'powershell.exe') continue;
        const stat = await fs.stat(resolved);
        if (stat.isFile()) return resolved;
      } catch { /* Try the next installed PowerShell. */ }
    }
    throw new Error('POWERSHELL_NOT_FOUND: install PowerShell or add powershell.exe / pwsh.exe directory to PATH.');
  })();
}
