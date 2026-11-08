// Copies the non-TypeScript files the server reads at runtime into dist/,
// because tsc only emits .js. Missing source folders are skipped.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const jobs = [
  ['src/server/db/migrations', 'dist/server/db/migrations', /\.sql$/],
  [
    'src/server/modules/agents/templates',
    'dist/server/modules/agents/templates',
    /\.md$/,
  ],
];

for (const [from, to, pattern] of jobs) {
  if (!existsSync(from)) continue;
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(from).filter((name) => pattern.test(name)))
    cpSync(join(from, file), join(to, file));
}
