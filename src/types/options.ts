export interface CLIOptions {
  out: string;
  concurrency: number;
  from?: string;
  to?: string;
  rewrite?: boolean;
  debug?: boolean;
  includeExternal?: boolean;
  // Commander sets `interactive` true by default when using `--no-interactive`
  interactive?: boolean;
  noInteractive?: boolean;
  noDedup?: boolean;
  // Deployment
  deploy?: boolean;
  select?: string;
  prod?: boolean;
  name?: string;
  // Allow unknowns
  [key: string]: any;
}
