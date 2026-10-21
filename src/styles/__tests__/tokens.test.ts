import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tokens } from '../tokens';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'tokens.css');

describe('design tokens', () => {
  it('defines the core token set', () => {
    expect(Object.keys(tokens)).toEqual(
      expect.arrayContaining([
        'color-bg',
        'color-surface',
        'color-text',
        'color-primary',
        'color-danger',
        'space-1',
        'space-2',
        'space-3',
        'radius-md',
        'font-family-base',
      ]),
    );
  });

  it('keeps tokens.css in sync with tokens.ts', () => {
    const css = readFileSync(cssPath, 'utf8');
    for (const name of Object.keys(tokens)) {
      expect(css, `missing CSS variable --${name}`).toContain(`--${name}:`);
    }
  });

  it('declares every CSS variable in tokens.css also in tokens.ts', () => {
    const css = readFileSync(cssPath, 'utf8');
    const declared = [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    for (const name of declared) {
      expect(tokens, `--${name} declared in CSS but missing from tokens.ts`).toHaveProperty(
        name as string,
      );
    }
  });
});
