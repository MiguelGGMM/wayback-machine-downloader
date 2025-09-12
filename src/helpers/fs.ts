import fs from 'node:fs/promises';
import path from 'node:path';
import type { Capture } from '../types/capture.js';

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

// Map an original URL to an output file path under the timestamp directory.
// Rules:
// - All content goes under: <outRoot>/<timestamp>/
// - Trailing slash paths map to index.html
// - Leading slash is removed before joining
export function targetPath(outRoot: string, cap: Capture): string {
  const u = new URL(cap.original);
  let p = u.pathname;
  if (p.endsWith('/')) p += 'index.html';
  const cleanPath = p.replace(/^\//, '');
  return path.join(outRoot, cap.timestamp, cleanPath);
}
