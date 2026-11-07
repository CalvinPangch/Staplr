// Runs the fake platform servers as their own process for Playwright
// (started by scripts/dev.mjs when STAPLR_TEST_MODE=1): GitHub/GitLab on
// FAKE_PORT and the Anthropic Models API on FAKE_ANTHROPIC_PORT.
import { startAnthropicFake } from './anthropic-fake';
import { startPlatformFake } from './platform-fake';

const platform = await startPlatformFake(
  Number(process.env['FAKE_PORT'] ?? 4330),
);
const anthropic = await startAnthropicFake(
  Number(process.env['FAKE_ANTHROPIC_PORT'] ?? 4350),
);
console.log(`Fake GitHub/GitLab listening on ${platform.url}`);
console.log(`Fake Anthropic API listening on ${anthropic.url}`);
async function stop() {
  await Promise.all([platform.close(), anthropic.close()]);
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
