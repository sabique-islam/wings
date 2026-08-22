import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        limit: async () => ({ data: [], error: null }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserted(row);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: "created-id",
                content: row.content ?? "",
                content_json: row.content_json ?? null,
                content_storage: row.content_storage ?? "cloud",
                created_at: "2026-08-23T00:00:00Z",
                user_id: row.user_id,
                pinned: false,
                parent_id: row.parent_id ?? null,
                title: row.title ?? "",
                share_token: null,
                layout: {},
                sort_order: null,
                deleted_at: null,
              },
              error: null,
            }),
          }),
        };
      },
    }),
  },
}));

import { createEntry } from "./journal";

describe("createEntry", () => {
  beforeEach(() => {
    inserted.mockReset();
  });

  it("stores a given name on the title column, not as body markdown", async () => {
    const entry = await createEntry("u1", "", { title: "  Weekly notes  " });
    expect(inserted).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        content: "",
        title: "Weekly notes",
      }),
    );
    expect(entry.title).toBe("Weekly notes");
    expect(entry.content).toBe("");
  });

  it("omits title when the name is blank so the page stays Untitled", async () => {
    await createEntry("u1", "");
    const row = inserted.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("title");
  });
});
