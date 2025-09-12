import { describe, it, expect } from 'vitest';
import { buildCdxUrl } from '../../src/requests/cdx.js';

const baseOpts = {
  out: './wayback',
  concurrency: 10,
} as any;

describe('buildCdxUrl', () => {
  it('builds exact match CDX URL with collapse by default', () => {
    const url = buildCdxUrl('https://example.com', baseOpts);
    expect(url).toContain('matchType=exact');
    expect(url).toContain('url=https%3A%2F%2Fexample.com');
    expect(url).toContain('collapse=digest');
  });

  it('omits collapse when noDedup is set', () => {
    const url = buildCdxUrl('https://example.com', { ...baseOpts, noDedup: true });
    expect(url).not.toContain('collapse=digest');
  });

  it('includes from/to when provided', () => {
    const url = buildCdxUrl('https://example.com', {
      ...baseOpts,
      from: '20190101',
      to: '20201231',
    });
    expect(url).toContain('from=20190101');
    expect(url).toContain('to=20201231');
  });
});
