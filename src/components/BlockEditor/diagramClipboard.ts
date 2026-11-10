import DOMPurify from "dompurify";
import { marked } from "marked";

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

/** Rebuild only from an adjacent table's explicit edges, corroborated by the copied labels. */
function diagramFromEdgeTable(context: string, labels: string): string | null {
  const tokens = marked.lexer(context, { gfm: true }).filter((token) => token.type !== "space");
  const table = tokens[tokens.length - 1];
  if (table?.type !== "table") return null;
  const column = table.header.findIndex((cell) => /^edges?$/i.test(cell.text.replace(/[*_`]/g, "").trim()));
  if (column < 0 || table.rows.length > 100) return null;
  const edges: string[] = [];
  const nodes = new Set<string>();
  for (const row of table.rows) {
    const value = (row[column]?.text || "").replace(/`/g, "").replace(/&(?:rarr|#8594|#x2192);/gi, "→").trim();
    if (!value || /^(?:none|no edge|[-—])$/i.test(value)) continue;
    const match = /^([a-zA-Z][a-zA-Z0-9_]{0,63})\s*(?:→|-->|->)\s*([a-zA-Z][a-zA-Z0-9_]{0,63})$/.exec(value);
    if (!match) return null;
    const [, from, to] = match;
    if ([from, to].some((id) => /^(?:end|subgraph|graph|flowchart|style|classDef|class|click|direction)$/i.test(id))) return null;
    nodes.add(from);
    nodes.add(to);
    const edge = `  ${from} --> ${to}`;
    if (!edges.includes(edge)) edges.push(edge);
  }
  if (!edges.length || nodes.size < 2) return null;
  const names = [...nodes].sort((a, b) => b.length - a.length);
  const compactLabels = labels.replace(/\s/g, "");
  const seen = new Set<string>();
  let offset = 0;
  while (offset < compactLabels.length) {
    const name = names.find((node) => compactLabels.startsWith(node, offset));
    if (!name) return null;
    seen.add(name);
    offset += name.length;
  }
  if (seen.size !== nodes.size) return null;
  return `flowchart TD\n${edges.join("\n")}`;
}

/** A flattened SVG has no geometry; use corroborated table edges or retain an explicit missing marker. */
export function replaceFlattenedDiagramCss(text: string): { text: string; missing: number; recovered: number } {
  let fence: string | null = null;
  let missing = 0;
  let recovered = 0;
  const lines: string[] = [];
  for (const original of text.split("\n")) {
    const line = original;
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      lines.push(original);
      continue;
    }
    // Markdown export escapes the leading # and underscores in generated SVG IDs.
    const css = original.replace(/\\([#_])/g, "$1");
    if (fence || !/^#chatgpt-mermaid-[^\s{]+\s*\{/.test(css) || !/\.(?:node|flowchart-link|edgePath)\b/.test(css)) {
      lines.push(original);
      continue;
    }
    const end = flattenedStylesheetEnd(css);
    if (!end) { lines.push(original); continue; }
    const labels = css.slice(end).trim();
    const source = diagramFromEdgeTable(lines.join("\n"), labels);
    if (source) {
      lines.push(`> Diagram rebuilt from the preceding Edge column.\n\n\`\`\`mermaid\n${source}\n\`\`\``);
      recovered++;
      continue;
    }
    missing++;
    lines.push(`> ${MISSING_DIAGRAM}${labels ? `\n\nCopied labels: ${labels}` : ""}`);
  }
  return { text: lines.join("\n"), missing, recovered };
}
