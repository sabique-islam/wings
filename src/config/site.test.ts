import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITE } from "./site";

describe("social preview image", () => {
  it("points at a same-origin JPEG sized for every major unfurl", () => {
    expect(SITE.ogImage).toBe(`${SITE.url}/og.jpg`);
    expect(SITE.ogImageType).toBe("image/jpeg");
    expect(SITE.ogImageWidth).toBe(1200);
    expect(SITE.ogImageHeight).toBe(630);
    expect(SITE.ogImageAlt.length).toBeGreaterThan(10);
  });

  it("index.html matches SITE so JS-less crawlers see the same card", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain(`property="og:image" content="${SITE.ogImage}"`);
    expect(html).toContain(`property="og:image:width" content="${SITE.ogImageWidth}"`);
    expect(html).toContain(`property="og:image:height" content="${SITE.ogImageHeight}"`);
    expect(html).toContain(`property="og:image:type" content="${SITE.ogImageType}"`);
    expect(html).toContain(`name="twitter:card" content="summary_large_image"`);
    expect(html).toContain(`name="twitter:image" content="${SITE.ogImage}"`);
    expect(html).not.toContain("gpt-engineer-file-uploads");
    expect(html).not.toContain("image/webp");
  });
});
