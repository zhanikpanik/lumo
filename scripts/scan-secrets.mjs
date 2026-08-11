import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean);

const findings = [];
const checks = [
  {
    name: 'public Instant admin token variable',
    matches: (line) => /(?:^\s*(?:VITE_INSTANT_ADMIN_TOKEN|EXPO_PUBLIC_[A-Z0-9_]*(?:ADMIN_TOKEN|SECRET))\s*=|import\.meta\.env\.VITE_INSTANT_ADMIN_TOKEN\b|process\.env\.EXPO_PUBLIC_[A-Z0-9_]*(?:ADMIN_TOKEN|SECRET)\b)/.test(line),
  },
  {
    name: 'literal admin token',
    matches: (line) => /\badminToken\s*:\s*["'`](?!\s*(?:process\.env|import\.meta\.env))/.test(line),
  },
  {
    name: 'literal INSTANT_ADMIN_TOKEN assignment',
    matches: (line) => {
      const match = /^\s*INSTANT_ADMIN_TOKEN\s*=\s*(\S+)/.exec(line);
      return Boolean(match && !/^(?:your-[\w-]+|example|\$\{[^}]+\})$/i.test(match[1]));
    },
  },
];

for (const file of files) {
  let content;
  try {
    content = readFileSync(resolve(file), 'utf8');
  } catch {
    continue;
  }

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const check of checks) {
      if (check.matches(line)) findings.push(`${file}:${index + 1}: ${check.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Secret scan failed. Remove privileged credentials from the repository:');
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${files.length} tracked or unignored files checked).`);
}
