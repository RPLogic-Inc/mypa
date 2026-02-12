import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('index.css design system', () => {
  it('includes redesign tokens, nav styles, badges, and animations', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(dir, 'index.css'), 'utf8');

    expect(css).toContain('--color-ai: #6366f1;');
    expect(css).toContain('.nav-item');
    expect(css).toContain('.nav-active');
    expect(css).toContain('.badge-web');
    expect(css).toContain('.btn-primary');
    expect(css).toContain('@keyframes fadeSlideUp');
    expect(css).toContain('.view-transition');
    expect(css).toContain('::-webkit-scrollbar');

    // Font size overrides
    expect(css).toContain('--text-xs: 0.8125rem');
    expect(css).toContain('--text-sm: 0.9375rem');
    expect(css).toContain('--text-base: 1.0625rem');
  });
});
