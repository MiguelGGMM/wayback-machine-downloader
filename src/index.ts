#!/usr/bin/env ts-node
// wayback-downloader.ts – A robust, TypeScript‑first CLI to mirror Wayback Machine snapshots
// --------------------------------------------------------------------------
// Features
//   • Uses the CDX API to list captures for a given domain or URL prefix
//   • Concurrent downloads with retry & resume support
//   • Replicates original folder structure under timestamped roots
//   • Optional date-range filter & link‑rewrite pass (absolute → relative)
//   • Clean dependency footprint (commander, p‑queue, progress only)
// --------------------------------------------------------------------------
// Usage examples
//   ✔ npx ts-node wayback-downloader.ts https://example.com -o ./archive
//   ✔ ts-node wayback-downloader.ts https://example.com/blog --from 2018 --to 2020 -c 20 --rewrite
//   ✔ node build/index.js <URL> [flags]   # after tsc or tsup build

import { Command } from "commander";
import PQueue from "p-queue";
import ProgressBar from "progress";
import prompts from "prompts";
import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

//---------------------------------------------------------------------
// Types
//---------------------------------------------------------------------
interface Capture {
  timestamp: string; // YYYYMMDDhhmmss
  original: string;
  mimetype?: string;
}

//---------------------------------------------------------------------
// CLI definition
//---------------------------------------------------------------------
const program = new Command();
program
  .name("wayback-downloader")
  .argument("<url>", "Root URL to mirror, e.g. https://example.com")
  .option("-o, --out <dir>", "Output directory", "./wayback")
  .option("-c, --concurrency <n>", "Max concurrent downloads", (v) => parseInt(v, 10), 10)
  .option("--from <YYYYMMDD>", "Earliest timestamp (inclusive)")
  .option("--to <YYYYMMDD>", "Latest timestamp (inclusive)")
  .option("--rewrite", "Rewrite HTML to strip web.archive.org prefixes")
  .option("--debug", "Write capture metadata to debug.json under each timestamp folder")
  .option("--include-external", "Also download third-party assets referenced by the page")
  .option("--no-interactive", "Do not prompt; download all matched captures directly")
  .option("--no-dedup", "Disable digest deduplication in CDX query")
  .parse();

// Require a URL argument; show help if missing
if (program.args.length < 1) {
  program.outputHelp();
  process.exit(1);
}

const opts = program.opts();
const rootUrl: string = program.args[0];
const outDir = path.resolve(opts.out);

//---------------------------------------------------------------------
// Helpers
//---------------------------------------------------------------------
function buildCdxUrl(): string {
  const base = "https://web.archive.org/cdx/search/cdx";
  const params = new URLSearchParams({
    url: rootUrl, // exact URL only
    output: "json",
    filter: "statuscode:200",
    fl: "timestamp,original,mimetype",
    matchType: "exact",
  });
  if (!opts.noDedup) params.append("collapse", "digest");
  if (opts.from) params.append("from", opts.from);
  if (opts.to) params.append("to", opts.to);
  return `${base}?${params}`;
}

function targetPath(outRoot: string, cap: Capture): string {
  const u = new URL(cap.original);
  // Put everything under the timestamp folder, keeping only the URL path structure
  let p = u.pathname;
  if (p.endsWith("/")) p += "index.html"; // "/" -> "/index.html", "/dir/" -> "/dir/index.html"
  // Remove leading slash for safe join
  const cleanPath = p.replace(/^\//, "");
  const filePath = path.join(outRoot, cap.timestamp, cleanPath);
  return filePath;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function waybackUrlFor(originalUrl: string, timestamp: string): string {
  // Keep identity by default; Wayback will serve the asset content at that time
  const ext = originalUrl.split("?")[0].split("#")[0].toLowerCase();
  let mod = "id_";
  if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|\.ico|\.bmp|\.tif|\.tiff)$/.test(ext)) mod = "im_";
  else if (/(\.css)$/.test(ext)) mod = "cs_";
  else if (/(\.js)$/.test(ext)) mod = "js_";
  return `https://web.archive.org/web/${timestamp}${mod}/${originalUrl}`;
}

function extractAssetUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const add = (u: string | null | undefined) => {
    if (!u) return;
    try {
      const abs = new URL(u, baseUrl).toString();
      urls.add(abs);
    } catch {
      /* ignore invalid */
    }
  };
  // src, href in common tags
  const attrRegex = /\b(?:src|href)=("|')(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(html))) add(m[2]);
  // srcset (take first URL of each descriptor)
  const srcsetRegex = /\bsrcset=("|')(.*?)\1/gi;
  while ((m = srcsetRegex.exec(html))) {
    const parts = m[2].split(",");
    for (const p of parts) add(p.trim().split(/\s+/)[0]);
  }
  // Basic filtering to avoid mailto:, data:, javascript:
  return Array.from(urls).filter((u) => /^(https?:)?\//.test(u) && !u.startsWith("data:") && !u.startsWith("javascript:"));
}

async function downloadUrlToPath(outRoot: string, timestamp: string, originalUrl: string) {
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

async function downloadSnapshot(outRoot: string, cap: Capture) {
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
      // Optional rewrite of HTML unless debug is on (per user's last change)
      if (!opts.debug && opts.rewrite && res.headers.get("content-type")?.includes("text/html")) {
        let html = await fs.readFile(dest, "utf8");
        html = html.replace(/https?:\/\/web\.archive\.org\/web\/[0-9]+id?\/_/g, "");
        await fs.writeFile(dest, html);
      }
      break;
    }
  }

  // Debug: write capture metadata
  if (opts.debug) {
    const debugPath = path.join(outRoot, cap.timestamp, "debug.json");
    await ensureDir(path.dirname(debugPath));
    const line = JSON.stringify(cap) + "\n";
    await fs.appendFile(debugPath, line, { encoding: "utf8" });
  }

  // Parse HTML and queue same-origin asset downloads only
  try {
    const html = await fs.readFile(dest, "utf8");
    const assets = extractAssetUrls(html, cap.original);
    const rootHost = new URL(cap.original).hostname;
    const sameHostAssets = assets.filter((a) => {
      try { return new URL(a).hostname === rootHost; } catch { return false; }
    });
    const assetsToFetch = opts.includeExternal ? assets : sameHostAssets;
    const queue = new PQueue({ concurrency: Math.max(2, Math.min(10, opts.concurrency)) });
    await Promise.all(assetsToFetch.map((a) => queue.add(() => downloadUrlToPath(outRoot, cap.timestamp, a).catch(() => {}))));
  } catch {
    // If read or parse fails, skip assets silently
  }
}

async function listCaptures(): Promise<Capture[]> {
  const cdxUrl = buildCdxUrl();
  const res = await fetch(cdxUrl);
  if (!res.ok) throw new Error(`CDX query failed: ${res.status} ${res.statusText}`);
  const rows: [string, string, string?][] = await res.json();
  // First row is header
  return rows.slice(1).map(([timestamp, original, mimetype]) => ({ timestamp, original, mimetype }));
}

//---------------------------------------------------------------------
// Main
//---------------------------------------------------------------------
(async () => {
  console.log("Querying CDX…");
  let captures = await listCaptures();
  console.log(`Found ${captures.length} captures for ${rootUrl}`);

  if (opts.interactive) {
    // Build a unique list of snapshot timestamps for the user to choose from
    const timestamps = Array.from(new Set(captures.map((c) => c.timestamp))).sort();

    const human = (ts: string) => {
      const yyyy = ts.slice(0, 4);
      const mm = ts.slice(4, 6);
      const dd = ts.slice(6, 8);
      const hh = ts.slice(8, 10);
      const mi = ts.slice(10, 12);
      const ss = ts.slice(12, 14);
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`;
    };

    const response = await prompts({
      type: "select",
      name: "ts",
      message: "Select a snapshot timestamp",
      choices: timestamps.map((t) => ({ title: `${t}  (${human(t)})`, value: t })),
    });

    if (!response.ts) {
      console.log("No selection made. Exiting.");
      process.exit(1);
    }

    const selectedTs: string = response.ts;
    captures = captures.filter((c) => c.timestamp === selectedTs);
    console.log(`Selected ${selectedTs} – ${captures.length} snapshot will be downloaded.`);
  }

  const bar = new ProgressBar("  downloading [:bar] :current/:total (:rate/s)", {
    total: captures.length,
    width: 30,
  });

  const queue = new PQueue({ concurrency: opts.concurrency });  
  captures.forEach((cap) => queue.add(() => downloadSnapshot(outDir, cap).then(() => bar.tick())));

  await queue.onIdle();
  console.log("✔ All done – check", outDir);
})();