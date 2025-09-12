import path from "node:path";
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import prompts from "prompts";
import { execa } from "execa";
import type { CLIOptions } from "../types/options.js";

export async function ensureVercelLoggedIn(): Promise<string> {
  try {
    const { stdout } = await execa("vercel", ["whoami"], { stdio: ["ignore", "pipe", "pipe"] });
    return stdout.trim();
  } catch {
    throw new Error(
      "You are not logged into Vercel. Please run `vercel login` first, then re-run with --deploy."
    );
  }
}

export async function ensureVercelJson(deployDir: string): Promise<void> {
  const vercelJsonPath = path.join(deployDir, "vercel.json");
  try {
    await fs.access(vercelJsonPath);
    return; // exists
  } catch {}
  const config = {
    version: 2,
    cleanUrls: true,
    trailingSlash: false,
  } as const;
  await fs.writeFile(vercelJsonPath, JSON.stringify(config, null, 2), "utf8");
}

export async function selectTimestampFolder(outDir: string, preselected?: string): Promise<string> {
  const entries: Dirent[] = await fs
    .readdir(outDir, { withFileTypes: true })
    .catch(() => [] as unknown as Dirent[]);
  const tsDirs: string[] = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (tsDirs.length === 0) throw new Error(`No snapshots found under ${outDir}`);

  if (preselected) {
    if (!tsDirs.includes(preselected)) throw new Error(`Timestamp '${preselected}' not found under ${outDir}`);
    return preselected;
  }

  const response = await prompts({
    type: "select",
    name: "ts",
    message: "Select a snapshot to deploy",
    choices: tsDirs.map((t: string) => ({ title: t, value: t })),
  });
  if (!response.ts) throw new Error("No selection made.");
  return response.ts as string;
}

export function buildVercelArgs(deployDir: string, opts: CLIOptions): string[] {
  const args = ["deploy", deployDir, "--yes"] as string[];
  if (opts.name) {
    args.push("--name", opts.name);
  }
  if (opts.prod) args.push("--prod");
  return args;
}

export async function deployWithVercel(outDir: string, opts: CLIOptions): Promise<void> {
  const user = await ensureVercelLoggedIn();
  console.log(`✔ Vercel logged in as ${user}`);

  const selectedTs = await selectTimestampFolder(outDir, opts.select);
  const deployDir = path.join(outDir, selectedTs);
  console.log(`Deploying folder: ${deployDir}`);

  await ensureVercelJson(deployDir);

  const args = buildVercelArgs(deployDir, opts);
  await execa("vercel", args, { stdio: "inherit" });
  console.log("✔ Deployment complete");
}
