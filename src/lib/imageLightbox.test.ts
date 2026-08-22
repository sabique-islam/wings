import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadLightboxImage,
  isLightboxImageSrc,
  lightboxFilename,
  parseLightboxPayload,
  requestCloseImageLightbox,
  requestOpenImageLightbox,
  shouldOpenImageLightbox,
} from "./imageLightbox";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isLightboxImageSrc", () => {
  it("allows http(s) and rejects javascript and data", () => {
    expect(isLightboxImageSrc("https://cdn.example.com/photo.png")).toBe(true);
    expect(isLightboxImageSrc("http://example.com/photo.png")).toBe(true);
    expect(isLightboxImageSrc("javascript:alert(1)")).toBe(false);
    expect(isLightboxImageSrc("data:image/png;base64,abc")).toBe(false);
    expect(isLightboxImageSrc("blob:https://example.com/1")).toBe(false);
    expect(isLightboxImageSrc("")).toBe(false);
  });
});

describe("parseLightboxPayload", () => {
  it("drops unsafe src instead of rendering it", () => {
    expect(parseLightboxPayload({ src: "javascript:alert(1)", caption: "x" })).toBeNull();
    expect(parseLightboxPayload({ src: "https://cdn.example.com/a.png", alt: "A", caption: "hi" })).toEqual({
      src: "https://cdn.example.com/a.png",
      alt: "A",
      caption: "hi",
    });
  });
});

describe("lightboxFilename", () => {
  it("prefers a cleaned caption, then the URL path", () => {
    expect(lightboxFilename("Lake / view", "https://cdn.example.com/x.png")).toBe("Lake view");
    expect(lightboxFilename("", "https://cdn.example.com/folder/shot.jpg")).toBe("shot.jpg");
    expect(lightboxFilename("..", "https://cdn.example.com/x")).toBe("x");
  });
});

describe("shouldOpenImageLightbox", () => {
  it("opens from the figure, not the resize handle or caption", () => {
    const figure = document.createElement("div");
    figure.className = "editor-image-figure";
    const img = document.createElement("img");
    const handle = document.createElement("span");
    handle.className = "editor-image-resize";
    const caption = document.createElement("input");
    caption.className = "editor-image-caption";
    figure.append(img, handle);
    document.body.append(figure, caption);

    expect(shouldOpenImageLightbox(img)).toBe(true);
    expect(shouldOpenImageLightbox(figure)).toBe(true);
    expect(shouldOpenImageLightbox(handle)).toBe(false);
    expect(shouldOpenImageLightbox(caption)).toBe(false);

    figure.remove();
    caption.remove();
  });
});

describe("requestOpenImageLightbox", () => {
  it("dispatches only a safe payload", () => {
    const seen: unknown[] = [];
    const onOpen = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener("nw:image-lightbox", onOpen);
    expect(requestOpenImageLightbox({ src: "javascript:alert(1)" })).toBe(false);
    expect(requestOpenImageLightbox({ src: "https://cdn.example.com/a.png", caption: "a" })).toBe(true);
    requestCloseImageLightbox();
    window.removeEventListener("nw:image-lightbox", onOpen);
    expect(seen).toEqual([{ src: "https://cdn.example.com/a.png", alt: "", caption: "a" }]);
  });
});

describe("downloadLightboxImage", () => {
  it("does not create a link for javascript src", () => {
    const append = vi.spyOn(document.body, "append");
    expect(downloadLightboxImage("javascript:alert(1)", "x")).toBe(false);
    expect(append).not.toHaveBeenCalled();
  });

  it("clicks a temporary download link for https", () => {
    const clicks: string[] = [];
    const proto = HTMLAnchorElement.prototype;
    const original = proto.click;
    proto.click = function click() {
      clicks.push(`${this.download}|${this.href}`);
    };
    expect(downloadLightboxImage("https://cdn.example.com/lake.png", "Lake")).toBe(true);
    proto.click = original;
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toContain("Lake");
    expect(clicks[0]).toContain("https://cdn.example.com/lake.png");
  });
});
