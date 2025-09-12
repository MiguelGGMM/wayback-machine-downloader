export function extractAssetUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const add = (u: string | null | undefined) => {
    if (!u) return;
    try {
      const abs = new URL(u, baseUrl).toString();
      urls.add(abs);
    } catch {
      /* ignore invalid */
    }
  };
  // src, href in common tags
  const attrRegex = /\b(?:src|href)=("|')(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(html))) add(m[2]);
  // srcset (take first URL of each descriptor)
  const srcsetRegex = /\bsrcset=("|')(.*?)\1/gi;
  while ((m = srcsetRegex.exec(html))) {
    const parts = m[2].split(",");
    for (const p of parts) add(p.trim().split(/\s+/)[0]);
  }
  // Basic filtering to avoid mailto:, data:, javascript:
  return Array.from(urls).filter((u) => /^(https?:)?\//.test(u) && !u.startsWith("data:") && !u.startsWith("javascript:"));
}
