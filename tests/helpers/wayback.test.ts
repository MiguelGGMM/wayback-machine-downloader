import { describe, it, expect } from "vitest";
import { waybackUrlFor } from "../../src/helpers/wayback.js";

const ts = "20250101123456";

describe("waybackUrlFor", () => {
  it("uses im_ for images", () => {
    const u = waybackUrlFor("https://example.com/a.png", ts);
    expect(u).toContain(`/${ts}im_/`);
  });
  it("uses cs_ for css", () => {
    const u = waybackUrlFor("https://example.com/style.css", ts);
    expect(u).toContain(`/${ts}cs_/`);
  });
  it("uses js_ for js", () => {
    const u = waybackUrlFor("https://example.com/app.js", ts);
    expect(u).toContain(`/${ts}js_/`);
  });
  it("defaults to id_ for html", () => {
    const u = waybackUrlFor("https://example.com/index.html", ts);
    expect(u).toContain(`/${ts}id_/`);
  });
});
