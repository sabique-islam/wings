import { beforeEach, describe, expect, it, vi } from "vitest";

const updateChain = vi.fn();
const update = vi.fn(() => ({ eq: updateChain }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update,
    }),
  },
}));

import { updateEntry, updateEntryProperties } from "./journal";

describe("updateEntry", () => {
  beforeEach(() => {
    updateChain.mockReset();
    update.mockClear();
  });

  it("updates without a returning row (shared editors may not SELECT entries)", async () => {
    updateChain.mockResolvedValue({ error: null });
    await expect(
      updateEntry("entry-id", { markdown: "hello", json: { type: "doc", content: [] } }),
    ).resolves.toBeUndefined();
    expect(updateChain).toHaveBeenCalledWith("id", "entry-id");
  });

  it("saves page properties without content columns", async () => {
    updateChain.mockResolvedValue({ error: null });
    await updateEntryProperties("entry-id", { pageSong: { source: "catalog", id: "rain" }, status: "draft" });
    expect(update).toHaveBeenCalledWith({
      properties: { pageSong: { source: "catalog", id: "rain" }, status: "draft" },
    });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("content");
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("content_json");
  });

  it("propagates Supabase errors", async () => {
    updateChain.mockResolvedValue({ error: { message: "row-level security" } });
    await expect(
      updateEntry("entry-id", { markdown: "hello", json: { type: "doc", content: [] } }),
    ).rejects.toEqual({ message: "row-level security" });
  });
});
