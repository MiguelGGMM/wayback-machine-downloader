# wayback-machine-downloader
Download web pages from the Wayback Machine

## Overview
This is a TypeScript-first CLI that mirrors snapshots from the Internet Archive's Wayback Machine.

Key features:
- Interactive snapshot selection by default (pick a timestamp to download)
- Exact page snapshots matching Wayback’s count (using CDX `matchType=exact`)
- Concurrent downloads with retry and resume
- Optional HTML rewrite to strip `web.archive.org` prefixes
- Same-origin asset download by default; optionally include external CDNs with a flag
- Date range filtering and digest deduplication toggle
- Deploy previously downloaded snapshots to Vercel with a single flag

## Requirements
- Node.js 20+ (ESM)
- pnpm (recommended)

## Install & Build
```bash
pnpm i
pnpm run build
```

## Usage
```bash
# Interactive: choose a snapshot timestamp to download
pnpm run start -- https://example.com

# Non-interactive: download without prompt
pnpm run start -- --no-interactive https://example.com

# Include third-party assets as referenced by the page (CDNs, etc.)
pnpm run start -- --no-interactive --include-external https://example.com

# Write capture metadata to debug.json and skip HTML rewrite
pnpm run start -- --no-interactive --debug https://example.com

# Custom output dir
pnpm run start -- -o ./archive https://example.com

# Filter by date range (inclusive)
pnpm run start -- --from 20190101 --to 20201231 https://example.com
```

### Deploy to Vercel
Requires a previously downloaded snapshot in your `--out` directory.

```bash
# Login once (if not already)
pnpm exec vercel login

# Deploy interactively (choose a timestamp folder under --out)
pnpm run start -- --deploy --out ./wayback

# Deploy a specific timestamp folder
pnpm run start -- --deploy --out ./wayback --select 20190520123456

# Name the Vercel project and deploy to production
pnpm run start -- --deploy --out ./wayback --select 20190520123456 --name my-archived-site --prod
```

### Flags
- `-o, --out <dir>` Output directory (default: `./wayback`)
- `-c, --concurrency <n>` Max concurrent downloads (default: 10)
- `--from <YYYYMMDD>` Earliest timestamp (inclusive)
- `--to <YYYYMMDD>` Latest timestamp (inclusive)
- `--rewrite` Rewrite HTML to strip `web.archive.org` prefixes (skipped when `--debug` is set)
- `--debug` Write capture metadata to `debug.json` under each timestamp folder
- `--include-external` Also download third-party assets referenced by the page (CDNs, analytics, etc.)
- `--no-interactive` Do not prompt; download all matched captures directly
- `--no-dedup` Disable digest deduplication in CDX query
- `--deploy` Deploy a previously downloaded snapshot to Vercel
- `--select <timestamp>` Timestamp folder to deploy (e.g. `20190520123456`). If omitted, you will be prompted
- `--prod` Deploy to production (equivalent to `vercel --prod`)
- `--name <project>` Project name to use on Vercel (maps to `vercel --name`)

### Output layout
All files for the selected snapshot are written under a timestamped folder:

```
wayback/
  20250214153220/
    index.html
    assets/...
    debug.json  # only when --debug is used (JSONL)
```

## Development
```bash
pnpm run dev          # tsx watch mode for local development
pnpm run build        # tsc compile to dist/
pnpm run lint         # ESLint
pnpm run format       # Prettier check
pnpm run format:write # Prettier write
```

## Project structure
```
src/
  cli/
    program.ts                # Commander CLI options
  commands/
    downloadSnapshot.ts       # Download one snapshot and its assets
  deploy/
    vercel.ts                 # Vercel deploy helpers and orchestrator
  helpers/
    fs.ts                     # ensureDir, targetPath
    html.ts                   # extractAssetUrls
    wayback.ts                # waybackUrlFor
  requests/
    cdx.ts                    # buildCdxUrl, listCaptures
  types/
    capture.ts
    options.ts
  index.ts                    # Orchestration entry point
```

## Tests
This project uses [Vitest](https://vitest.dev/).

```bash
pnpm run test         # run tests once
pnpm run test:watch   # watch mode
```

Covered units:
- `helpers/fs.ts` → `targetPath()` mapping of URLs to disk paths
- `helpers/html.ts` → `extractAssetUrls()` parsing
- `helpers/wayback.ts` → `waybackUrlFor()` Wayback modifier selection
- `requests/cdx.ts` → `buildCdxUrl()` parameter building
- `deploy/vercel.ts` → `ensureVercelJson()` and `buildVercelArgs()`

Skip prompt; download everything in the range:
```bash
pnpm run start -- https://example.com --no-interactive --from 20200101 --to 20201231
```

Download all files for the selected snapshot (no digest collapse):
```bash
pnpm run start -- https://example.com --no-dedup
```

Higher concurrency with HTML rewrite:
```bash
pnpm run start -- https://example.com -c 20 --rewrite
```

## Notes
- This project is ESM (`"type": "module"`) and compiles with `module: NodeNext`.
- When running without arguments, the CLI will print help and exit.
