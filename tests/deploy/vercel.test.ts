import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ensureVercelJson, buildVercelArgs } from "../../src/deploy/vercel.js";

function mkTmpDir() {
  const dir = path.join(os.tmpdir(), `wbd-vercel-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return dir;
}

describe("deploy/vercel", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = mkTmpDir();
    await fs.mkdir(tmp, { recursive: true });
  });

  afterEach(async () => {
    // best-effort cleanup
    try {
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {}
  });

  it("ensureVercelJson creates a basic config when missing", async () => {
    await ensureVercelJson(tmp);
    const file = path.join(tmp, "vercel.json");
    const content = JSON.parse(await fs.readFile(file, "utf8"));
    expect(content).toEqual({ version: 2, cleanUrls: true, trailingSlash: false });
  });

  it("ensureVercelJson does not overwrite existing file", async () => {
    const file = path.join(tmp, "vercel.json");
    await fs.writeFile(file, JSON.stringify({ version: 2, custom: true }), "utf8");
    await ensureVercelJson(tmp);
    const content = JSON.parse(await fs.readFile(file, "utf8"));
    expect(content).toEqual({ version: 2, custom: true });
  });

  it("buildVercelArgs builds args respecting name and prod", () => {
    const baseDir = "/deploy";
    expect(buildVercelArgs(baseDir, { prod: false } as any)).toEqual([
      "deploy",
      baseDir,
      "--yes",
    ]);

    expect(buildVercelArgs(baseDir, { name: "proj" } as any)).toEqual([
      "deploy",
      baseDir,
      "--yes",
      "--name",
      "proj",
    ]);

    expect(buildVercelArgs(baseDir, { prod: true } as any)).toEqual([
      "deploy",
      baseDir,
      "--yes",
      "--prod",
    ]);

    expect(buildVercelArgs(baseDir, { name: "proj", prod: true } as any)).toEqual([
      "deploy",
      baseDir,
      "--yes",
      "--name",
      "proj",
      "--prod",
    ]);
  });
});
