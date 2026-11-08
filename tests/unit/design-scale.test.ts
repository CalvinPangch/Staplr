import { it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Feature 004, SC-006: one type scale (at most 5 sizes) and one spacing scale
 * (at most 8 values) across the whole app, in markup and in style sheets.
 */
/**
 * The only text sizes are text-title, text-section, text-body, text-secondary
 * and text-caption (defined in app.css); Tailwind's own size names are refused.
 */
/** Tailwind steps of 4 px: 4, 8, 12, 16, 24, 32, 48, 64 px, plus 0 and px. */
const spacingSteps = new Set([
  '0',
  'px',
  '1',
  '2',
  '3',
  '4',
  '6',
  '8',
  '12',
  '16',
  'auto',
]);
const spacingPx = new Set([0, 1, 4, 8, 12, 16, 24, 32, 48, 64]);

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path, ext)
      : ext.test(name)
        ? [path]
        : [];
  });
}

it('markup uses only the shared text sizes and spacing scale', () => {
  const offences: string[] = [];
  for (const file of files('src/web', /\.tsx$/)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /className=(?:"([^"]*)"|\{[^}]*?['`"]([^'`"]*)['`"])/g,
    )) {
      const classes = (match[1] ?? match[2] ?? '').split(/\s+/);
      for (const raw of classes) {
        const cls = raw.replace(/^([a-z-]+:)+/, '');
        if (/^text-(xs|sm|base|lg|xl|\dxl)$/.test(cls))
          offences.push(`${file}: ${raw}`);
        const space =
          /^-?(?:gap-x|gap-y|space-x|space-y|gap|px|py|pt|pr|pb|pl|p|mx|my|mt|mr|mb|ml|m)-(.+)$/.exec(
            cls,
          );
        if (
          space &&
          !spacingSteps.has(space[1] as string) &&
          !(space[1] as string).startsWith('[')
        )
          offences.push(`${file}: ${raw}`);
        if (/^text-\[/.test(cls) || /^(?:p|m|gap)[xytrbl]?-\[/.test(cls))
          offences.push(`${file}: ${raw}`);
      }
    }
  }
  expect(offences).toEqual([]);
});

it('style sheets use only the shared spacing scale and text-size tokens', () => {
  const offences: string[] = [];
  for (const file of files('src/web/styles', /\.css$/)) {
    const source = readFileSync(file, 'utf8');
    for (const [, prop, value] of source.matchAll(
      /\b(font-size|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap)\s*:\s*([^;]+);/g,
    )) {
      const v = (value as string).trim();
      if (prop === 'font-size') {
        if (!/^var\(--fs-[a-z]+\)$/.test(v) && v !== 'inherit' && v !== '100%')
          offences.push(`${file}: ${prop}: ${v}`);
        continue;
      }
      // safe-area insets and the tab bar height are layout, not the spacing scale
      if (/^(calc|env|max|min)\(/.test(v)) continue;
      for (const part of v.split(/\s+/)) {
        if (
          /^var\(--space-[1-8]\)$/.test(part) ||
          part === 'auto' ||
          part === '0'
        )
          continue;
        const px = /^(\d+(?:\.\d+)?)px$/.exec(part);
        const rem = /^(\d+(?:\.\d+)?)rem$/.exec(part);
        const value = px ? Number(px[1]) : rem ? Number(rem[1]) * 16 : NaN;
        if (!spacingPx.has(value) && !/^(env|calc|max|min)\(/.test(part))
          offences.push(`${file}: ${prop}: ${v}`);
      }
    }
  }
  expect(offences).toEqual([]);
});
