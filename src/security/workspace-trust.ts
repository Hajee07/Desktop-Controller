import path from 'node:path';
import { isWithin } from './paths.js';
import type { AppContext } from '../server/types.js';

export function isTrustedWorkspace(ctx: AppContext, file: string): boolean {
  if (!ctx.config.permissions?.automaticWorkspaceEdits) return false;
  const target = path.resolve(file);
  if (isWithin(path.join(ctx.projectDir, 'workspace'), target)) return true;
  return ctx.config.permissions.automaticAuthorizedRootEdits === true &&
    ctx.config.authorizedRoots.some(root => isWithin(path.resolve(root), target));
}
