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
    url: rootUrl.endsWith("/*") ? rootUrl : `${rootUrl}/*`,
    output: "json",
    filter: "statuscode:200",
    fl: "timestamp,original",
  });
  if (!opts.noDedup) params.append("collapse", "digest");
  if (opts.from) params.append("from", opts.from);
  if (opts.to) params.append("to", opts.to);
  return `${base}?${params}`;
}

async function listCaptures(): Promise<Capture[]> {
  const cdxUrl = buildCdxUrl();
  const res = await fetch(cdxUrl);
  if (!res.ok) throw new Error(`CDX query failed: ${res.status} ${res.statusText}`);
  const rows: [string, string][] = await res.json();
  // First row is header
  return rows.slice(1).map(([timestamp, original]) => ({ timestamp, original }));
}

function buildSnapshotUrl({ timestamp, original }: Capture): string {
  return `https://web.archive.org/web/${timestamp}id_/${original}`;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function targetPath(outRoot: string, cap: Capture): string {
  const u = new URL(cap.original);
  const filePath = path.join(outRoot, cap.timestamp, u.hostname, u.pathname.replace(/\/$/, "index.html"));
  return filePath;
}

async function downloadCapture(outRoot: string, cap: Capture) {
  const dest = targetPath(outRoot, cap);
  if (existsSync(dest)) return; // resume: skip existing

  await ensureDir(path.dirname(dest));
  const url = buildSnapshotUrl(cap);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (!res.ok) {
      if (attempt === 3) throw new Error(`HTTP ${res.status} at ${url}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      continue;
    }
    // Stream to disk
    const fileStream = createWriteStream(dest);
    await pipeline(res.body!, fileStream);

    // Optionally rewrite HTML
    if (opts.rewrite && res.headers.get("content-type")?.includes("text/html")) {
      let html = await fs.readFile(dest, "utf8");
      html = html.replace(/https?:\/\/web\.archive\.org\/web\/[0-9]+id?\/_/g, "");
      await fs.writeFile(dest, html);
    }
    return;
  }
}

//---------------------------------------------------------------------
// Main
//---------------------------------------------------------------------
(async () => {
  console.log("Querying CDX…");
  const captures = await listCaptures();
  console.log(`Found ${captures.length} captures for ${rootUrl}`);

  const bar = new ProgressBar("  downloading [:bar] :current/:total (:rate/s)", {
    total: captures.length,
    width: 30,
  });

  const queue = new PQueue({ concurrency: opts.concurrency });
  captures.forEach((cap) => queue.add(() => downloadCapture(outDir, cap).then(() => bar.tick())));

  await queue.onIdle();
  console.log("✔ All done – check", outDir);
})();