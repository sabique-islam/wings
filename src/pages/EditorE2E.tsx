import { useCallback, useState } from "react";
import { BlockEditor } from "@/components/BlockEditor/BlockEditor";
import { htmlToMarkdown } from "@/lib/markdown";
import { requestEditorSerialize, type EditorChangePayload } from "@/lib/editorPayload";

const ENTRY_ID = "e2e-harness";

/** Workspace so the `@` and `[[` page pickers have something to offer. */
const INITIAL_PAGES = [
  { id: "page-reading-list", title: "Reading List" },
  { id: "page-release-notes", title: "Release Notes" },
];

const PREVIEWS: Record<string, { title: string; preview: string }> = {
  "page-reading-list": { title: "Reading List", preview: "Books to get through this year." },
  "page-release-notes": { title: "Release Notes", preview: "What shipped and when." },
};

function getE2EPagePreview(pageId: string) {
  return PREVIEWS[pageId] ?? null;
}

export default function EditorE2E() {
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState("");
  const [aiText, setAiText] = useState("");
  const [requestedPage, setRequestedPage] = useState("");
  const [pages, setPages] = useState(INITIAL_PAGES);
  /** Bumped to remount the editor from markdown alone, as a cold load would. */
  const [mount, setMount] = useState(0);

  const handleChange = useCallback((payload: EditorChangePayload) => {
    // Mirror the app's save path: typing emits JSON, markdown comes from a
    // full serialize requested just before the content would be persisted.
    const storedMarkdown = payload.markdown ?? requestEditorSerialize(ENTRY_ID)?.markdown ?? "";
    const editor = (window as any).__nw_editor;
    const renderedMarkdown = editor ? htmlToMarkdown(editor.getHTML()) : storedMarkdown;
    const requestMarkdown = (window as any).__nw_getMarkdown?.() ?? storedMarkdown;
    setContent(storedMarkdown);
    setPreview(renderedMarkdown);
    setAiText(requestMarkdown);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-3xl mx-auto border border-border rounded-md min-h-[360px] p-4">
        <BlockEditor
          key={mount}
          entryId={ENTRY_ID}
          content={content}
          onChange={handleChange}
          pages={pages}
          getPagePreview={getE2EPagePreview}
          onNewPage={setRequestedPage}
        />
      </div>
      <button type="button" data-testid="reload-from-markdown" onClick={() => setMount((m) => m + 1)}>
        reload from markdown
      </button>
      <button
        type="button"
        data-testid="rename-reading-list"
        onClick={() => {
          setPages((current) =>
            current.map((page) =>
              page.id === "page-reading-list" ? { ...page, title: "Bookshelf" } : page,
            ),
          );
          PREVIEWS["page-reading-list"] = {
            title: "Bookshelf",
            preview: PREVIEWS["page-reading-list"]?.preview ?? "",
          };
        }}
      >
        rename first fixture page
      </button>
      <section aria-label="editor parity" className="sr-only">
        <pre data-testid="stored-text">{content}</pre>
        <pre data-testid="markdown-preview">{preview}</pre>
        <pre data-testid="ai-request-text">{aiText}</pre>
        <pre data-testid="requested-page">{requestedPage}</pre>
      </section>
    </main>
  );
}
