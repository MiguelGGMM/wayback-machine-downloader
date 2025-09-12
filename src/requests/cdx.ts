import type { CLIOptions } from '../types/options.js';
import type { Capture } from '../types/capture.js';

export function buildCdxUrl(rootUrl: string, opts: CLIOptions): string {
  const base = 'https://web.archive.org/cdx/search/cdx';
  const params = new URLSearchParams({
    url: rootUrl, // exact URL only
    output: 'json',
    filter: 'statuscode:200',
    fl: 'timestamp,original,mimetype',
    matchType: 'exact',
  });
  if (!opts.noDedup) params.append('collapse', 'digest');
  if (opts.from) params.append('from', opts.from);
  if (opts.to) params.append('to', opts.to);
  return `${base}?${params}`;
}

export async function listCaptures(rootUrl: string, opts: CLIOptions): Promise<Capture[]> {
  const cdxUrl = buildCdxUrl(rootUrl, opts);
  const res = await fetch(cdxUrl);
  if (!res.ok) throw new Error(`CDX query failed: ${res.status} ${res.statusText}`);
  const rows: [string, string, string?][] = await res.json();
  // First row is header
  return rows
    .slice(1)
    .map(([timestamp, original, mimetype]) => ({ timestamp, original, mimetype }));
}
