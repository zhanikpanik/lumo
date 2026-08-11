import { execFileSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const hooksPath = '.githooks';
const hook = resolve(hooksPath, 'pre-commit');

execFileSync('git', ['config', 'core.hooksPath', hooksPath], { stdio: 'inherit' });
chmodSync(hook, 0o755);
