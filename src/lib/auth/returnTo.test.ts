import { beforeEach, describe, expect, it } from "vitest";
import { isSafeReturnTo, stashReturnTo, takeReturnTo } from "./returnTo";

describe("isSafeReturnTo", () => {
  it("allows the OAuth consent path and its query", () => {
    expect(isSafeReturnTo("/oauth/authorize?client_id=wings_cli_abc&scope=read")).toBe(true);
  });

  it("rejects off-site targets", () => {
    expect(isSafeReturnTo("//evil.example")).toBe(false);
    expect(isSafeReturnTo("/\\evil.example")).toBe(false);
    expect(isSafeReturnTo("https://evil.example")).toBe(false);
  });

  it("keeps https values that belong in the consent query", () => {
    expect(isSafeReturnTo("/oauth/authorize?redirect_uri=https://claude.ai/callback&resource=https://wings.nopejs.me/api/mcp")).toBe(true);
  });
});

describe("stashReturnTo", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips once and then clears", () => {
    stashReturnTo("/oauth/authorize?scope=read");
    expect(takeReturnTo()).toBe("/oauth/authorize?scope=read");
    expect(takeReturnTo()).toBeNull();
  });

  it("does not store an external URL", () => {
    stashReturnTo("https://evil.example/phish");
    expect(takeReturnTo()).toBeNull();
  });
});
