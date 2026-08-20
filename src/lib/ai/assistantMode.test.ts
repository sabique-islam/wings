import { describe, expect, it, beforeEach } from "vitest";
import {
  canApplyAiTools,
  getAssistantMode,
  isAssistantMode,
  setAssistantMode,
  systemPromptFor,
  toolsIgnoredNotice,
} from "./assistantMode";

describe("assistantMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to Ask so the panel does not write until Agent is chosen", () => {
    expect(getAssistantMode()).toBe("ask");
  });

  it("persists a valid mode", () => {
    setAssistantMode("agent");
    expect(getAssistantMode()).toBe("agent");
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem("wings_ai_mode", "debug");
    expect(getAssistantMode()).toBe("ask");
  });

  it("only Agent may apply write tools", () => {
    expect(canApplyAiTools("ask")).toBe(false);
    expect(canApplyAiTools("plan")).toBe(false);
    expect(canApplyAiTools("agent")).toBe(true);
  });

  it("does not teach the tool protocol in Ask or Plan", () => {
    expect(systemPromptFor("ask")).not.toContain("```tool:write");
    expect(systemPromptFor("plan")).not.toContain("```tool:write");
    expect(systemPromptFor("ask")).not.toContain("You may emit fenced action blocks");
    expect(systemPromptFor("agent")).toContain("```tool:write");
    expect(systemPromptFor("ask")).toContain("Ask mode");
    expect(systemPromptFor("plan")).toContain("Plan mode");
  });

  it("narrows stored strings", () => {
    expect(isAssistantMode("ask")).toBe(true);
    expect(isAssistantMode("plan")).toBe(true);
    expect(isAssistantMode("agent")).toBe(true);
    expect(isAssistantMode("")).toBe(false);
  });

  it("names the current read-only mode in the ignored-tools notice", () => {
    expect(toolsIgnoredNotice("ask")).toContain("Ask");
    expect(toolsIgnoredNotice("plan")).toContain("Plan");
  });
});
