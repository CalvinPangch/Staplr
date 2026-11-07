// Runs the fake platform server as its own process for Playwright
// (started by scripts/dev.mjs when STAPLR_TEST_MODE=1).
import { startPlatformFake } from './platform-fake';

const port = Number(process.env['FAKE_PORT'] ?? 4330);
const fake = await startPlatformFake(port);
console.log(`Fake GitHub/GitLab listening on ${fake.url}`);
process.on('SIGTERM', () => void fake.close().then(() => process.exit(0)));
process.on('SIGINT', () => void fake.close().then(() => process.exit(0)));
