import { describe, expect, it } from "vitest";
import {
  filterCodeLanguages,
  formatCodeLanguageLabel,
  getCodeBlockLanguages,
  isMermaidLanguage,
  normalizeCodeLanguage,
} from "./codeLanguages";

describe("codeLanguages", () => {
  it("includes C and C++ in the language picker", () => {
    const languages = getCodeBlockLanguages();
    expect(languages).toContain("c");
    expect(languages).toContain("cpp");
    expect(languages).toContain("mermaid");
    expect(languages.length).toBeGreaterThan(100);
  });

  it("normalizes common fence aliases", () => {
    expect(normalizeCodeLanguage("c++")).toBe("cpp");
    expect(normalizeCodeLanguage("C#")).toBe("csharp");
    expect(normalizeCodeLanguage("py")).toBe("python");
    expect(normalizeCodeLanguage(null)).toBe("plaintext");
  });

  it("formats friendly labels for common languages", () => {
    expect(formatCodeLanguageLabel("cpp")).toBe("C++");
    expect(formatCodeLanguageLabel("c")).toBe("C");
    expect(formatCodeLanguageLabel("haskell")).toBe("haskell");
    expect(formatCodeLanguageLabel("mermaid")).toBe("Mermaid");
  });

  it("ranks typescript first when filtering by ts", () => {
    const matches = filterCodeLanguages("ts", "plaintext");
    expect(matches[0]).toBe("typescript");
    expect(matches).toContain("typescript");
  });

  it("matches C++ from the fence alias", () => {
    const matches = filterCodeLanguages("c++", "plaintext");
    expect(matches[0]).toBe("cpp");
  });

  it("recognizes mermaid as a preview language", () => {
    expect(isMermaidLanguage("mermaid")).toBe(true);
    expect(isMermaidLanguage("typescript")).toBe(false);
  });
});
