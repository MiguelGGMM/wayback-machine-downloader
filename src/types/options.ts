export interface CLIOptions {
  out: string;
  concurrency: number;
  from?: string;
  to?: string;
  rewrite?: boolean;
  debug?: boolean;
  includeExternal?: boolean;
  noInteractive?: boolean;
  noDedup?: boolean;
  // Allow unknowns
  [key: string]: any;
}
