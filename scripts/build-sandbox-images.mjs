// Builds the Codex login image and the test stub image.
//   node scripts/build-sandbox-images.mjs [codex|stub|all]   (default: all)
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const targets = {
  stub: ['staplr-sandbox-stub:test', 'stub.Dockerfile'],
  codex: ['staplr-codex:local', 'codex.Dockerfile'],
};
const wanted = process.argv[2] ?? 'all';
const names = wanted === 'all' ? Object.keys(targets) : [wanted];
const context = join(process.cwd(), 'docker', 'sandbox');
for (const name of names) {
  const target = targets[name];
  if (!target) {
    console.error(`Unknown image "${name}". Use codex, stub or all.`);
    process.exit(2);
  }
  const [tag, file] = target;
  console.log(`Building ${tag}`);
  const result = spawnSync(
    'docker',
    ['build', '-t', tag, '-f', join(context, file), context],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
