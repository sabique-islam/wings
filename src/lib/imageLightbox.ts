import { isSafeHttpUrl } from "@/lib/safeUrl";

export const IMAGE_LIGHTBOX_OPEN_EVENT = "nw:image-lightbox";
export const IMAGE_LIGHTBOX_CLOSE_EVENT = "nw:image-lightbox-close";

export type ImageLightboxPayload = {
  src: string;
  alt: string;
  caption: string;
};

/** Lightbox only loads stored http(s) URLs. javascript: / data: / blob: stay out. */
export function isLightboxImageSrc(raw: string | null | undefined): boolean {
  return isSafeHttpUrl(raw);
}

export function parseLightboxPayload(raw: unknown): ImageLightboxPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const src = String(input.src ?? "").trim();
  if (!isLightboxImageSrc(src)) return null;
  return {
    src,
    alt: String(input.alt ?? ""),
    caption: String(input.caption ?? ""),
  };
}

export function lightboxFilename(caption: string, src: string): string {
  const fromCaption = caption.replace(/[^\w.\- ()]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (fromCaption && fromCaption !== "." && fromCaption !== "..") return fromCaption;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const name = new URL(src, base).pathname.split("/").pop() ?? "";
    const safe = name.replace(/[^\w.\-]+/g, "").slice(0, 80);
    if (safe) return safe;
  } catch {
    // fall through
  }
  return "image";
}

/** Resize handle, align toolbar, and caption keep their own click. */
export function shouldOpenImageLightbox(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".editor-image-resize, .editor-image-toolbar, .editor-image-caption")) {
    return false;
  }
  return Boolean(target.closest(".editor-image-figure"));
}

export function requestOpenImageLightbox(raw: unknown): boolean {
  const payload = parseLightboxPayload(raw);
  if (!payload || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(IMAGE_LIGHTBOX_OPEN_EVENT, { detail: payload }));
  return true;
}

export function requestCloseImageLightbox(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IMAGE_LIGHTBOX_CLOSE_EVENT));
}

/** Temporary <a download> — same idea as a blob-url click, but only for safe http(s). */
export function downloadLightboxImage(src: string, caption = ""): boolean {
  if (!isLightboxImageSrc(src) || typeof document === "undefined") return false;
  const link = document.createElement("a");
  link.href = src;
  link.download = lightboxFilename(caption, src);
  link.rel = "noopener";
  link.target = "_blank";
  document.body.append(link);
  link.click();
  link.remove();
  return true;
}
