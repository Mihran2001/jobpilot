import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Local development reads the repo-root .env. In containers the variables
 * are set by the platform and the file does not exist. Already-set
 * variables win.
 */
export function loadRootEnvFile(): void {
  const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
}
