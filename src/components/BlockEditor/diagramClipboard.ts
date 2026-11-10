import DOMPurify from "dompurify";

const MAX_SVG_CHARACTERS = 1_000_000;
const DIAGRAM_SELECTOR = 'svg[id*="mermaid"], .mermaid svg, svg[aria-roledescription]';
const SOURCE_HEADER = /^(?:%%[^\n]*\n\s*)*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|timeline|journey|gitGraph|quadrantChart|xychart-beta|block-beta|packet-beta|architecture-beta|kanban|sankey-beta)\b/;
const MISSING_DIAGRAM = "Diagram missing from copy. Copy the diagram's Mermaid source or paste a diagram image here.";

function flattenedStylesheetEnd(line: string): number {
  let cursor = 0;
  let end = 0;
  while (/^(?:#chatgpt-mermaid-|@[\w-]+\b)/.test(line.slice(cursor))) {
    let depth = 0;
    let quote = "";
    let comment = false;
    let complete = false;
    for (; cursor < line.length; cursor++) {
      const character = line[cursor];
      if (comment) {
        if (character === "*" && line[cursor + 1] === "/") { comment = false; cursor++; }
        continue;
      }
      if (quote) {
        if (character === "\\") cursor++;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === "/" && line[cursor + 1] === "*") { comment = true; cursor++; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === "{") depth++;
      else if (character === "}" && --depth === 0) {
        end = ++cursor;
        complete = true;
        break;
      }
    }
    if (!complete) break;
    while (/\s/.test(line[cursor] || "") && cursor < line.length) cursor++;
  }
  return end;
}

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

/** Used exclusively in an image data URL, never mounted as inline HTML/SVG. */
function diagramImageSource(svg: Element): string | null {
  if (svg.outerHTML.length > MAX_SVG_CHARACTERS) return null;
  const clean = DOMPurify.sanitize(svg.outerHTML, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ["foreignObject"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "image", "feImage", "img", "video", "audio", "link", "a", "animate", "animateMotion", "animateTransform", "set"],
    ALLOW_DATA_ATTR: false,
  });
  const document = new DOMParser().parseFromString(clean, "text/html");
  const root = document.querySelector("svg");
  if (!root) return null;
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const unsafeCss = /@import|expression\s*\(|javascript\s*:|url\(\s*(?!['"]?#)[^)]/i;
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (element.localName === "style" && unsafeCss.test(element.textContent || "")) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if ((/^(?:href|xlink:href)$/i.test(attribute.name) && !attribute.value.startsWith("#")) || unsafeCss.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  // Rendered Mermaid commonly has width="100%"; preserve its intrinsic aspect ratio.
  const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    const scale = Math.min(1, 4096 / Math.max(viewBox[2], viewBox[3]));
    root.setAttribute("width", String(viewBox[2] * scale));
    root.setAttribute("height", String(viewBox[3] * scale));
  }
  return `data:image/svg+xml;base64,${base64Utf8(new XMLSerializer().serializeToString(root))}`;
}

/** Recover editable source when supplied; otherwise retain the copied diagram as a static image. */
export function prepareRenderedDiagramHtml(html: string, text = ""): { html: string; snapshots: number; missing: number } | null {
  if (!/<svg\b/i.test(html)) return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  const diagrams = Array.from(document.querySelectorAll(DIAGRAM_SELECTOR)).filter((svg) => !svg.parentElement?.closest("svg") && !svg.closest(".katex, mjx-container, math"));
  if (!diagrams.length) return null;
  const fencedSources = Array.from(text.matchAll(/(?:^|\n)```mermaid[^\n]*\n([\s\S]*?)\n```/gi), (match) => match[1]);
  let snapshots = 0;
  let missing = 0;
  diagrams.forEach((svg, index) => {
    const owner = svg.closest("[data-mermaid-source], [data-source]");
    const candidate = owner?.getAttribute("data-mermaid-source") || owner?.getAttribute("data-source") || (fencedSources.length === diagrams.length ? fencedSources[index] : "");
    if (SOURCE_HEADER.test(candidate.trim())) {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-mermaid";
      code.textContent = candidate.trim();
      pre.append(code);
      svg.replaceWith(pre);
      return;
    }
    const src = diagramImageSource(svg);
    if (src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "Copied Mermaid diagram";
      image.setAttribute("data-caption", "Copied diagram snapshot · Mermaid source was not included");
      svg.replaceWith(image);
      snapshots++;
    } else {
      const notice = document.createElement("p");
      notice.textContent = MISSING_DIAGRAM;
      svg.replaceWith(notice);
      missing++;
    }
  });
  // Clipboard styling is presentation, not note text. SVG styling is already inside the image.
  document.querySelectorAll("style").forEach((element) => element.remove());
  return { html: document.body.innerHTML, snapshots, missing };
}

/** A flattened SVG stylesheet has labels but no arrows/source. Never invent its graph. */
export function replaceFlattenedDiagramCss(text: string): { text: string; missing: number } {
  let fence: string | null = null;
  let missing = 0;
  const lines = text.split("\n").map((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return line;
    }
    if (fence || !/^#chatgpt-mermaid-[^\s{]+\s*\{/.test(line) || !/\.(?:node|flowchart-link|edgePath)\b/.test(line)) return line;
    const end = flattenedStylesheetEnd(line);
    if (!end) return line;
    const labels = line.slice(end).trim();
    missing++;
    return `> ${MISSING_DIAGRAM}${labels ? `\n\nCopied labels: ${labels}` : ""}`;
  });
  return { text: lines.join("\n"), missing };
}
