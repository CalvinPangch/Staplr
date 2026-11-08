import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Feature 004, FR-004a / SC-009: Inter is served by Staplr and text stays
 * visible in the fallback font while it loads.
 */
it('the bundled Inter stylesheet uses local files and font-display: swap', () => {
  const main = readFileSync('src/web/main.tsx', 'utf8');
  expect(main).toContain("import '@fontsource-variable/inter/wght.css';");
  const css = readFileSync(
    'node_modules/@fontsource-variable/inter/wght.css',
    'utf8',
  );
  const sources = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] ?? '');
  expect(sources.length).toBeGreaterThan(0);
  for (const src of sources) expect(src).toMatch(/^\.\/files\/.+\.woff2$/);
  const faces = css.match(/@font-face/g)?.length ?? 0;
  expect(css.match(/font-display:\s*swap/g)?.length).toBe(faces);
});

it('the font stack falls back to the system font', () => {
  const tokens = readFileSync('src/web/styles/tokens.css', 'utf8');
  expect(tokens).toMatch(
    /--font-sans:\s*'Inter Variable',\s*-apple-system,\s*BlinkMacSystemFont/,
  );
});
