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

import PQueue from "p-queue";
import ProgressBar from "progress";
import prompts from "prompts";
import path from "node:path";
import { getOpts, getRootUrl } from "./cli/program.js";
import type { Capture } from "./types/capture.js";
import type { CLIOptions } from "./types/options.js";
import { listCaptures } from "./requests/cdx.js";
import { downloadSnapshot } from "./commands/downloadSnapshot.js";
import { deployWithVercel } from "./deploy/vercel.js";

//---------------------------------------------------------------------
// CLI options and paths
//---------------------------------------------------------------------
const opts: CLIOptions = getOpts();
const rootUrl: string | undefined = getRootUrl();
const outDir = path.resolve(opts.out);

//---------------------------------------------------------------------
// Deploy mode via Vercel
//---------------------------------------------------------------------
if (opts.deploy) {
  (async () => {
    try {
      await deployWithVercel(outDir, opts);
    } catch (e: any) {
      console.error(e?.message ?? e);
      process.exit(1);
    }
  })();
} else {
  //---------------------------------------------------------------------
  // Main download flow
  //---------------------------------------------------------------------
  (async () => {
    if (!rootUrl) {
      console.error("A <url> argument is required unless using --deploy");
      process.exit(1);
    }

    console.log("Querying CDX…");
    let captures = await listCaptures(rootUrl, opts);
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
    captures.forEach((cap) => queue.add(() => downloadSnapshot(outDir, cap, opts).then(() => bar.tick())));

    await queue.onIdle();
    console.log("✔ All done – check", outDir);
  })();
}