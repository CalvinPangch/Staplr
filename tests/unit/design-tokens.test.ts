import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Feature 004: every colour pair the design system promises meets WCAG 2.2 AA
 * in both themes, including text on the frosted bars in the worst case
 * (research R1, R2; contracts/ui-system.md).
 */
const css = readFileSync('src/web/styles/tokens.css', 'utf8');

/** The `--name: value;` declarations inside the block that starts at `selector {`. */
function block(selector: string, from = 0): Record<string, string> {
  const start = css.indexOf(`${selector} {`, from);
  if (start < 0) throw new Error(`missing block ${selector}`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(start, end);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1] as string,
      (m[2] as string).trim(),
    ]),
  );
}

const light = block(':root');
const dark = block(":root[data-theme='dark']");
const darkAuto = block(
  ":root:not([data-theme='light'])",
  css.indexOf('@media (prefers-color-scheme: dark)'),
);

type Rgba = { r: number; g: number; b: number; a: number };
function colour(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex)
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
      a: 1,
    };
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)(%?)\s*\)$/.exec(
    value,
  );
  if (rgb)
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: Number(rgb[4]) / (rgb[5] ? 100 : 1),
    };
  throw new Error(`not a colour: ${value}`);
}
const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});
const luminance = ({ r, g, b }: Rgba) => {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};
const ratio = (a: Rgba, b: Rgba) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const colourTokens = [
  '--c-bg',
  '--c-surface',
  '--c-surface-raised',
  '--c-fg',
  '--c-muted',
  '--c-separator',
  '--c-control',
  '--c-accent',
  '--c-accent-fg',
  '--c-bar',
];
const statuses = ['good', 'attention', 'failed', 'progress', 'neutral'];

describe.each([
  ['light', light, { r: 0, g: 0, b: 0, a: 1 }],
  ['dark', dark, { r: 255, g: 255, b: 255, a: 1 }],
] as const)('%s theme', (_name, theme, worstUnderBar) => {
  const c = (token: string) => {
    const value = theme[token];
    if (!value) throw new Error(`missing ${token}`);
    return colour(value);
  };

  it('defines every colour token of the design system', () => {
    for (const token of [
      ...colourTokens,
      ...statuses.flatMap((s) => [`--c-status-${s}`, `--c-status-${s}-soft`]),
    ])
      expect(theme[token], token).toBeDefined();
  });

  it('keeps text at 4.5:1 or more on every surface', () => {
    for (const fg of ['--c-fg', '--c-muted', '--c-accent'])
      for (const bg of ['--c-bg', '--c-surface'])
        expect(ratio(c(fg), c(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
          4.5,
        );
    expect(ratio(c('--c-fg'), c('--c-surface-raised'))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(ratio(c('--c-accent-fg'), c('--c-accent'))).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const s of statuses)
      expect(
        ratio(c(`--c-status-${s}`), c(`--c-status-${s}-soft`)),
        s,
      ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps control borders and the focus ring at 3:1 or more', () => {
    expect(ratio(c('--c-control'), c('--c-surface'))).toBeGreaterThanOrEqual(3);
    expect(ratio(c('--c-accent'), c('--c-bg'))).toBeGreaterThanOrEqual(3);
  });

  it('keeps text on the frosted bars readable even over the worst content', () => {
    const bar = c('--c-bar');
    expect(bar.a).toBeGreaterThanOrEqual(0.92);
    const worst = over(bar, worstUnderBar);
    for (const fg of ['--c-fg', '--c-accent'])
      expect(ratio(c(fg), worst), fg).toBeGreaterThanOrEqual(4.5);
  });
});

/*
 * The AdminLTE parts (research R1): the sidebar is dark and the stat tiles are
 * solid in both themes, so their tokens live only in :root and the dark blocks
 * never redefine them.
 */
describe('sidebar and stat tiles', () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const c = (token: string) => {
    const value = light[token];
    if (!value) throw new Error(`missing ${token}`);
    return colour(value);
  };
  const sidebarTokens = [
    '--c-sidebar',
    '--c-sidebar-fg',
    '--c-sidebar-muted',
    '--c-sidebar-accent',
    '--c-sidebar-current',
  ];
  const tiles = ['accent', 'progress', 'attention', 'failed'];

  it('are the same in both themes', () => {
    for (const token of [
      ...sidebarTokens,
      ...tiles.map((t) => `--c-tile-${t}`),
    ]) {
      expect(light[token], token).toBeDefined();
      expect(dark[token], token).toBeUndefined();
      expect(darkAuto[token], token).toBeUndefined();
    }
  });

  it('keeps sidebar text at 4.5:1, even with the panel over a white page', () => {
    const sidebar = c('--c-sidebar');
    expect(sidebar.a).toBeGreaterThanOrEqual(0.94);
    const worst = over(sidebar, white);
    for (const fg of [
      '--c-sidebar-fg',
      '--c-sidebar-muted',
      '--c-sidebar-accent',
    ])
      expect(ratio(c(fg), worst), fg).toBeGreaterThanOrEqual(4.5);
    for (const fg of ['--c-sidebar-fg', '--c-sidebar-accent'])
      expect(
        ratio(c(fg), c('--c-sidebar-current')),
        `${fg} on the current item`,
      ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps white text at 4.5:1 on every stat tile', () => {
    for (const t of tiles)
      expect(ratio(white, c(`--c-tile-${t}`)), t).toBeGreaterThanOrEqual(4.5);
  });
});

describe('dark theme', () => {
  it('is the same whether chosen explicitly or by the system setting', () => {
    expect(darkAuto).toEqual(dark);
  });
});
