import {
  defineConfig,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';
import type { PresetWind4Theme } from 'unocss';
import { tokens } from './src/styles/tokens';

const ref = (name: string): string => `var(--${name})`;

function collect<T>(prefix: string, map: (name: string, value: string) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, value] of Object.entries(tokens)) {
    if (name.startsWith(prefix)) out[name.slice(prefix.length)] = map(name, value);
  }
  return out;
}

const unoTheme = {
  colors: collect('color-', (name) => ref(name)),
  radius: collect('radius-', (_name, value) => value),
  font: {
    sans: ref('font-family-base'),
    mono: ref('font-family-mono'),
  },
};

export default defineConfig<PresetWind4Theme>({
  presets: [presetWind4()],
  theme: unoTheme,
  transformers: [transformerDirectives(), transformerVariantGroup()],
  rules: [
    ['shadow-soft', { 'box-shadow': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)' }],
    ['shadow-card', { 'box-shadow': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.04)' }],
    ['shadow-elevated', { 'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)' }],
  ],
  shortcuts: {
    'btn': 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-150 select-none outline-none focus-visible:(ring-2 ring-primary ring-offset-2) active:scale-[0.98]',
    'btn-primary': 'bg-primary text-primary-contrast shadow-sm hover:bg-primary-hover active:bg-primary-hover',
    'btn-secondary': 'bg-surface text-text border border-border shadow-soft hover:bg-bg-subtle hover:border-text-muted',
    'btn-ghost': 'text-text-muted hover:text-text hover:bg-bg-subtle',
    'badge-pill': 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide border',
    'card-base': 'rounded-xl border border-border bg-surface p-6 shadow-card transition-all duration-200',
    'card-hover': 'hover:shadow-elevated hover:border-text-subtle/50',
    'section-container': 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8',
  },
});
