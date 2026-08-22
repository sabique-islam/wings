import DOMPurify, { type Config } from "dompurify";

// Central HTML sanitizer for any place we render model- or user-derived HTML.
// DOMPurify strips <script>, event-handler attributes, and javascript:/data:
// URLs by default; we further restrict to a safe display allowlist.

const BASE_CONFIG: Config = {
  ALLOWED_TAGS: [
    "a", "b", "i", "em", "strong", "u", "s", "del", "code", "pre",
    "blockquote", "p", "br", "hr", "span", "div",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td",
    "img",
  ],
  ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt", "class"],
  // Block any URL scheme except http(s), mailto, and data: images.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  ADD_ATTR: ["target"],
};

/** Sanitize HTML for read-only display (e.g. AI chat bubbles). Returns a string. */
export function sanitizeHtml(dirty: string): string {
  const clean = DOMPurify.sanitize(dirty, BASE_CONFIG) as unknown as string;
  return clean;
}

const SVG_CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
};

/** Sanitize mermaid (and similar) SVG before mounting it in a code-block preview. */
export function sanitizeSvg(dirty: string): string {
  return DOMPurify.sanitize(dirty, SVG_CONFIG) as unknown as string;
}
