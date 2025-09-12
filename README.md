# wayback-machine-downloader
Download web pages from the Wayback Machine

## Overview
This is a TypeScript-first CLI that mirrors snapshots from the Internet Archive's Wayback Machine.

Key features:
- Interactive snapshot selection by default (pick a timestamp to download)
- Concurrent downloads with retry and resume
- Optional HTML rewrite to strip `web.archive.org` prefixes
- Date range filtering and digest deduplication toggle

## Requirements
- Node.js 20+ (ESM)
- pnpm (recommended)

## Install & Build
```bash
pnpm install
pnpm run build
```

## Run
Default behavior prompts you to select one snapshot timestamp before downloading.

```bash
pnpm run start -- <url>
# example
pnpm run start -- https://example.com
```

## CLI Options
- `-o, --out <dir>`
  Output directory. Default: `./wayback`

- `-c, --concurrency <n>`
  Max concurrent downloads. Default: `10`

- `--from <YYYYMMDD>` / `--to <YYYYMMDD>`
  Limit captures to a date range (inclusive).

- `--rewrite`
  For HTML responses, strip Wayback prefixes to produce locally browsable files.

- `--no-dedup`
  Disable digest deduplication in the CDX query. Without this, identical content across captures is collapsed. Use this to fetch all files captured for the chosen timestamp.

- `--no-interactive`
  Skip the timestamp prompt and download all matched captures directly.

## Examples
Select a snapshot interactively (default):
```bash
pnpm run start -- https://example.com
```

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
