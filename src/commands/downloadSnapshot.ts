import PQueue from 'p-queue';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import type { Capture } from '../types/capture.js';
import type { CLIOptions } from '../types/options.js';
import { ensureDir, targetPath } from '../helpers/fs.js';
import { waybackUrlFor } from '../helpers/wayback.js';
import { extractAssetUrls } from '../helpers/html.js';

export async function downloadUrlToPath(outRoot: string, timestamp: string, originalUrl: string) {
  const dest = targetPath(outRoot, { timestamp, original: originalUrl });
  if (existsSync(dest)) return;
  await ensureDir(path.dirname(dest));
  const url = waybackUrlFor(originalUrl, timestamp);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (!res.ok) {
      if (attempt === 3) throw new Error(`HTTP ${res.status} at ${url}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      continue;
    }
    const fileStream = createWriteStream(dest);
    await pipeline(res.body!, fileStream);
    return;
  }
}

export async function downloadSnapshot(outRoot: string, cap: Capture, opts: CLIOptions) {
  // Download main HTML for the exact page
  const dest = targetPath(outRoot, cap);
  if (!existsSync(dest)) {
    await ensureDir(path.dirname(dest));
    const url = waybackUrlFor(cap.original, cap.timestamp);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(url);
      if (!res.ok) {
        if (attempt === 3) throw new Error(`HTTP ${res.status} at ${url}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      const fileStream = createWriteStream(dest);
      await pipeline(res.body!, fileStream);
      // Optional rewrite of HTML unless debug is on
      if (!opts.debug && opts.rewrite && res.headers.get('content-type')?.includes('text/html')) {
        let html = await fs.readFile(dest, 'utf8');
        html = html.replace(/https?:\/\/web\.archive\.org\/web\/[0-9]+id?\/_/g, '');
        await fs.writeFile(dest, html);
      }
      break;
    }
  }

  // Debug: write capture metadata
  if (opts.debug) {
    const debugPath = path.join(outRoot, cap.timestamp, 'debug.json');
    await ensureDir(path.dirname(debugPath));
    const line = JSON.stringify(cap) + '\n';
    await fs.appendFile(debugPath, line, { encoding: 'utf8' });
  }

  // Parse HTML and queue asset downloads
  try {
    const html = await fs.readFile(dest, 'utf8');
    const assets = extractAssetUrls(html, cap.original);
    const rootHost = new URL(cap.original).hostname;
    const sameHostAssets = assets.filter((a) => {
      try {
        return new URL(a).hostname === rootHost;
      } catch {
        return false;
      }
    });
    const assetsToFetch = opts.includeExternal ? assets : sameHostAssets;
    const queue = new PQueue({ concurrency: Math.max(2, Math.min(10, opts.concurrency)) });
    await Promise.all(
      assetsToFetch.map((a) =>
        queue.add(() => downloadUrlToPath(outRoot, cap.timestamp, a).catch(() => {})),
      ),
    );
  } catch {
    // If read or parse fails, skip assets silently
  }
}
