import { describe, it, expect, vi } from "vitest";
import { checkUsernameAvailability, validateUsername } from "./username";

describe("validateUsername", () => {
  it("rejects short, long, invalid, and reserved names", () => {
    expect(validateUsername("a").reason).toBe("too_short");
    expect(validateUsername("a".repeat(31)).reason).toBe("too_long");
    expect(validateUsername("Bad Name!").reason).toBe("invalid");
    expect(validateUsername("admin").reason).toBe("reserved");
    expect(validateUsername("trash").reason).toBe("reserved");
  });

  it("accepts valid usernames", () => {
    expect(validateUsername("ada_lovelace").ok).toBe(true);
  });
});

describe("checkUsernameAvailability", () => {
  it("short-circuits invalid and reserved without calling lookup", async () => {
    const lookup = vi.fn(async () => "available" as const);
    const invalid = await checkUsernameAvailability("!!", undefined, lookup);
    expect(invalid.status).toBe("invalid");
    expect(lookup).not.toHaveBeenCalled();

    const reserved = await checkUsernameAvailability("admin", undefined, lookup);
    expect(reserved.status).toBe("reserved");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns available when lookup says available", async () => {
    const result = await checkUsernameAvailability("lovelace", "user-1", async () => "available");
    expect(result).toEqual({ status: "available", message: "available" });
  });

  it("returns taken when lookup says taken", async () => {
    const result = await checkUsernameAvailability("takenname", "user-1", async () => "taken");
    expect(result).toEqual({ status: "taken", message: "username already taken" });
  });

  it("fail-closes on lookup error", async () => {
    const result = await checkUsernameAvailability("maybe", "user-1", async () => "error");
    expect(result).toEqual({ status: "taken", message: "couldn't verify" });
  });
});
