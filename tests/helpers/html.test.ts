import { describe, it, expect } from "vitest";
import { extractAssetUrls } from "../../src/helpers/html.js";

const base = "https://example.com/page/index.html";

describe("extractAssetUrls", () => {
  it("extracts href and src links and resolves relative URLs", () => {
    const html = `
      <link rel="stylesheet" href="/css/main.css">
      <script src="/js/app.js"></script>
      <img src="/img/logo.png">
      <a href="about/">About</a>
    `;
    const urls = extractAssetUrls(html, base).sort();
    expect(urls).toContain("https://example.com/css/main.css");
    expect(urls).toContain("https://example.com/js/app.js");
    expect(urls).toContain("https://example.com/img/logo.png");
    expect(urls).toContain("https://example.com/page/about/");
  });

  it("handles srcset and ignores data: and javascript:", () => {
    const html = `
      <img srcset="/img/1x.png 1x, /img/2x.png 2x">
      <a href="javascript:void(0)">x</a>
      <img src="data:image/png;base64,AAAA" />
    `;
    const urls = extractAssetUrls(html, base).sort();
    expect(urls).toContain("https://example.com/img/1x.png");
    expect(urls).toContain("https://example.com/img/2x.png");
    expect(urls.find(u => u.startsWith("data:"))).toBeUndefined();
    expect(urls.find(u => u.startsWith("javascript:"))).toBeUndefined();
  });
});
