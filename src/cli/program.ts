import { Command } from "commander";
import type { CLIOptions } from "../types/options.js";

const program = new Command();

program
  .name("wayback-downloader")
  .argument("[url]", "Root URL to mirror, e.g. https://example.com")
  .option("-o, --out <dir>", "Output directory", "./wayback")
  .option("-c, --concurrency <n>", "Max concurrent downloads", (v) => parseInt(v, 10), 10)
  .option("--from <YYYYMMDD>", "Earliest timestamp (inclusive)")
  .option("--to <YYYYMMDD>", "Latest timestamp (inclusive)")
  .option("--rewrite", "Rewrite HTML to strip web.archive.org prefixes")
  .option("--debug", "Write capture metadata to debug.json under each timestamp folder")
  .option("--include-external", "Also download third-party assets referenced by the page")
  .option("--no-interactive", "Do not prompt; download all matched captures directly")
  .option("--no-dedup", "Disable digest deduplication in CDX query")
  // Deployment options
  .option("--deploy", "Deploy a previously downloaded snapshot using Vercel")
  .option("--select <timestamp>", "Timestamp folder to deploy (e.g. 20190520123456). If omitted, you will be prompted.")
  .option("--prod", "Deploy to production (equivalent to `vercel --prod`)")
  .option("--name <project>", "Project name to use on Vercel (maps to `vercel --name`)")
  .parse();

export function getOpts(): CLIOptions {
  return program.opts<CLIOptions>();
}

export function getRootUrl(): string | undefined {
  if (program.args.length < 1) {
    return undefined;
  }
  return program.args[0] as string;
}
