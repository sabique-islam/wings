import { all, createLowlight } from "lowlight";
import { fuzzyMatch } from "./blockCommands";

/** Highlight.js grammars for every language lowlight ships. */
export const codeBlockLowlight = createLowlight(all);

/** Diagram language: highlighted as plain text, previewed separately. */
export const MERMAID_LANGUAGE = "mermaid";

const LANGUAGE_ALIASES: Record<string, string> = {
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  objc: "objectivec",
  "objective-c": "objectivec",
};

const LANGUAGE_LABELS: Record<string, string> = {
  c: "C",
  cpp: "C++",
  csharp: "C#",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  plaintext: "Plain text",
  mermaid: "Mermaid",
};

/** Map fence tags like `c++` to highlight.js ids like `cpp`. */
export function normalizeCodeLanguage(language: string | null | undefined): string {
  const raw = (language ?? "").trim().toLowerCase();
  if (!raw) return "plaintext";
  return LANGUAGE_ALIASES[raw] ?? raw;
}

export function formatCodeLanguageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language;
}

let cachedLanguages: string[] | null = null;

/** All registered languages, plain text first, then alphabetical. */
export function getCodeBlockLanguages(): string[] {
  if (cachedLanguages) return cachedLanguages;
  const registered = new Set(codeBlockLowlight.listLanguages());
  registered.add(MERMAID_LANGUAGE);
  const sorted = [...registered]
    .filter((language) => language !== "plaintext")
    .sort((a, b) => formatCodeLanguageLabel(a).localeCompare(formatCodeLanguageLabel(b)));
  cachedLanguages = ["plaintext", ...sorted];
  return cachedLanguages;
}

/** Language picker options, preserving unknown attrs from imported markdown. */
export function getCodeBlockLanguageOptions(currentLanguage: string): string[] {
  const languages = getCodeBlockLanguages();
  if (!currentLanguage || languages.includes(currentLanguage)) return languages;
  return [currentLanguage, ...languages];
}

export function isMermaidLanguage(language: string | null | undefined): boolean {
  return normalizeCodeLanguage(language) === MERMAID_LANGUAGE;
}

function aliasesFor(language: string): string[] {
  return Object.entries(LANGUAGE_ALIASES)
    .filter(([, id]) => id === language)
    .map(([alias]) => alias);
}

/** Ranked language ids for the code-block picker. Empty query keeps the full list. */
export function filterCodeLanguages(query: string, currentLanguage: string): string[] {
  const options = getCodeBlockLanguageOptions(currentLanguage);
  const trimmed = query.trim();
  if (!trimmed) return options;
  return options
    .map((language) => ({
      language,
      score: fuzzyMatch(trimmed, formatCodeLanguageLabel(language), [
        language,
        ...aliasesFor(language),
      ]),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.language.localeCompare(b.language))
    .map(({ language }) => language);
}
