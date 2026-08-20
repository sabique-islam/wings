import { describe, expect, it } from "vitest";
import { APPLIED_TO_PAGE_NOTICE } from "./assistantMode";
import { finalizeAssistantOutput, parseToolBlocks } from "./toolBlocks";

const WRITE = "```tool:write\nHello from the model\n```";

describe("parseToolBlocks", () => {
  it("extracts write/replace/newpage/image fences", () => {
    const text = [
      "Intro",
      WRITE,
      "```tool:replace\n# New page\n```",
      "```tool:newpage\ntitle: Notes\n---\nBody\n```",
      "```tool:image\na quiet lake at dawn\n```",
      "Outro",
    ].join("\n");
    const { stripped, tools } = parseToolBlocks(text);
    expect(tools.map((t) => t.kind)).toEqual(["write", "replace", "newpage", "image"]);
    expect(tools[0].body).toBe("Hello from the model");
    expect(stripped).toContain("Intro");
    expect(stripped).toContain("Outro");
    expect(stripped).not.toContain("tool:write");
  });

  it("does not treat ordinary markdown fences as tools", () => {
    const { tools, stripped } = parseToolBlocks("```md\n# Draft\n```");
    expect(tools).toEqual([]);
    expect(stripped).toContain("# Draft");
  });
});

describe("finalizeAssistantOutput", () => {
  it("applies tools only when prompted and still in Agent", () => {
    const result = finalizeAssistantOutput(WRITE, "agent", "agent");
    expect(result.toolsToApply).toHaveLength(1);
    expect(result.display).toBe(APPLIED_TO_PAGE_NOTICE);
  });

  it("does not apply tools in Ask even if the model emitted them", () => {
    const result = finalizeAssistantOutput(WRITE, "ask", "ask");
    expect(result.toolsToApply).toEqual([]);
    expect(result.display).toContain("Ask");
    expect(result.display).toContain("Agent");
  });

  it("does not apply tools in Plan", () => {
    const result = finalizeAssistantOutput(`${WRITE}\nHere is the plan.`, "plan", "plan");
    expect(result.toolsToApply).toEqual([]);
    expect(result.display).toContain("Here is the plan.");
    expect(result.display).not.toContain("tool:write");
  });

  it("does not apply if the user left Agent before the reply finished", () => {
    const result = finalizeAssistantOutput(WRITE, "agent", "ask");
    expect(result.toolsToApply).toEqual([]);
  });

  it("does not apply Agent-mode tools from an Ask-prompted turn", () => {
    const result = finalizeAssistantOutput(WRITE, "ask", "agent");
    expect(result.toolsToApply).toEqual([]);
  });

  it("keeps ordinary chat when there are no tool fences", () => {
    const result = finalizeAssistantOutput("Just a summary.", "agent", "agent");
    expect(result.toolsToApply).toEqual([]);
    expect(result.display).toBe("Just a summary.");
  });
});
