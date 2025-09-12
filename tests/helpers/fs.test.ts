import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { targetPath } from '../../src/helpers/fs.js';

const ts = '20250101123456';

describe('targetPath', () => {
  it("maps root path '/' to index.html under timestamp", () => {
    const p = targetPath('/out', { timestamp: ts, original: 'https://example.com/' });
    expect(p).toBe(path.join('/out', ts, 'index.html'));
  });

  it('maps directory paths to index.html', () => {
    const p = targetPath('/out', { timestamp: ts, original: 'https://example.com/docs/' });
    expect(p).toBe(path.join('/out', ts, 'docs', 'index.html'));
  });

  it('keeps file names for non-directory URLs', () => {
    const p = targetPath('/out', { timestamp: ts, original: 'https://example.com/app.js' });
    expect(p).toBe(path.join('/out', ts, 'app.js'));
  });
});
