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
    url: rootUrl.endsWith("/*") ? rootUrl : `${rootUrl}/*`,
    output: "json",
    filter: "statuscode:200",
    fl: "timestamp,original,mimetype",
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
  const rows: [string, string, string?][] = await res.json();
  // First row is header
  return rows.slice(1).map(([timestamp, original, mimetype]) => ({ timestamp, original, mimetype }));
}

function buildSnapshotUrl({ timestamp, original, mimetype }: Capture): string {
  // Choose Wayback content modifiers based on mimetype for best fidelity
  let mod = "id_"; // identity (no rewriting)
  const mt = (mimetype || "").toLowerCase();
  if (mt.startsWith("image/")) mod = "im_"; // images
  else if (mt.includes("css")) mod = "cs_"; // stylesheets
  else if (mt.includes("javascript") || mt.includes("ecmascript")) mod = "js_"; // scripts
  return `https://web.archive.org/web/${timestamp}${mod}/${original}`;
}

function targetPath(outRoot: string, cap: Capture): string {
  const u = new URL(cap.original);
  const filePath = path.join(outRoot, cap.timestamp, u.hostname, u.pathname.replace(/\/$/, "index.html"));
  return filePath;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
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
    if (!opts.debug && opts.rewrite && res.headers.get("content-type")?.includes("text/html")) {
      let html = await fs.readFile(dest, "utf8");
      html = html.replace(/https?:\/\/web\.archive\.org\/web\/[0-9]+id?\/_/g, "");
      await fs.writeFile(dest, html);
    }

    // Debug: write capture metadata to timestamp folder
    if (opts.debug) {
      const debugPath = path.join(outRoot, cap.timestamp, "debug.json");
      await ensureDir(path.dirname(debugPath));
      const line = JSON.stringify(cap) + "\n";
      await fs.appendFile(debugPath, line, { encoding: "utf8" });
    }
    return;
  }
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
    console.log(`Selected ${selectedTs} – ${captures.length} files will be downloaded.`);
  }

  const bar = new ProgressBar("  downloading [:bar] :current/:total (:rate/s)", {
    total: captures.length,
    width: 30,
  });

  const queue = new PQueue({ concurrency: opts.concurrency });  
  captures.forEach((cap) => queue.add(() => downloadCapture(outDir, cap).then(() => bar.tick())));

  await queue.onIdle();
  console.log("✔ All done – check", outDir);
})();