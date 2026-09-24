import { useCallback, useEffect, useMemo, useState } from "react";
import { BlockEditor } from "@/components/BlockEditor/BlockEditor";
import { PagePeekHost } from "@/components/PagePeekHost";
import { LectureModePanel } from "@/components/LectureModePanel";
import { htmlToMarkdown } from "@/lib/markdown";
import { requestEditorSerialize, type EditorChangePayload } from "@/lib/editorPayload";
import { patchEditorAppearance } from "@/lib/editorAppearance";

const ENTRY_ID = "e2e-harness";
const SPLIT_ENTRY_ID = "e2e-split";

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
  const splitMode = new URLSearchParams(window.location.search).has("split");
  const [content, setContent] = useState("");
  const [splitContent, setSplitContent] = useState("");
  const [primaryEntryId, setPrimaryEntryId] = useState(ENTRY_ID);
  const [preview, setPreview] = useState("");
  const [aiText, setAiText] = useState("");
  const [requestedPage, setRequestedPage] = useState("");
  const [pages, setPages] = useState(INITIAL_PAGES);
  /** Bumped to remount the editor from markdown alone, as a cold load would. */
  const [mount, setMount] = useState(0);
  const [peekNavigated, setPeekNavigated] = useState("");
  const [lectureOpen, setLectureOpen] = useState(false);

  const peekEntries = useMemo(
    () =>
      pages.map((page) => ({
        id: page.id,
        title: page.title,
        content: PREVIEWS[page.id]?.preview ?? "",
        content_json: null,
      })),
    [pages],
  );

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

  const handleSplitChange = useCallback((payload: EditorChangePayload) => {
    const storedMarkdown =
      payload.markdown ?? requestEditorSerialize(SPLIT_ENTRY_ID)?.markdown ?? "";
    setSplitContent(storedMarkdown);
  }, []);

  const openLecture = useCallback(() => setLectureOpen(true), []);

  useEffect(() => {
    const open = () => setLectureOpen(true);
    window.addEventListener("nw:lecture", open);
    return () => window.removeEventListener("nw:lecture", open);
  }, []);

  useEffect(() => {
    if (!splitMode) return;
    const testWindow = window as typeof window & {
      __nw_testSerializeEntry?: (entryId: string) => EditorChangePayload | null;
    };
    testWindow.__nw_testSerializeEntry = requestEditorSerialize;
    return () => {
      delete testWindow.__nw_testSerializeEntry;
    };
  }, [splitMode]);

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <div className={splitMode ? "mx-auto flex max-w-6xl gap-4" : "mx-auto max-w-3xl"}>
        <div
          className="min-h-[360px] min-w-0 flex-1 border border-border rounded-md p-4"
          data-testid="primary-editor-pane"
          onMouseDownCapture={() => setPrimaryEntryId(ENTRY_ID)}
        >
          <BlockEditor
            key={mount}
            entryId={ENTRY_ID}
            content={content}
            onChange={handleChange}
            pages={pages}
            getPagePreview={getE2EPagePreview}
            onNewPage={setRequestedPage}
            onLecture={openLecture}
            hostGlobals={primaryEntryId === ENTRY_ID}
          />
        </div>
        {splitMode && (
          <div
            className="min-h-[360px] min-w-0 flex-1 border border-border rounded-md p-4"
            data-testid="secondary-editor-pane"
            onMouseDownCapture={() => setPrimaryEntryId(SPLIT_ENTRY_ID)}
          >
            <BlockEditor
              entryId={SPLIT_ENTRY_ID}
              content={splitContent}
              onChange={handleSplitChange}
              pages={pages}
              getPagePreview={getE2EPagePreview}
              hostGlobals={primaryEntryId === SPLIT_ENTRY_ID}
            />
          </div>
        )}
        <PagePeekHost
          entries={peekEntries}
          pages={pages}
          getPagePreview={getE2EPagePreview}
          onNavigate={setPeekNavigated}
        />
      </div>
      <LectureModePanel
        open={lectureOpen}
        onClose={() => setLectureOpen(false)}
        hasPage
        canEdit
      />
      <button type="button" data-testid="reload-from-markdown" onClick={() => setMount((m) => m + 1)}>
        reload from markdown
      </button>
      <button type="button" data-testid="appearance-serif" onClick={() => patchEditorAppearance({ fontFamily: "serif" })}>
        serif
      </button>
      <button type="button" data-testid="appearance-size-20" onClick={() => patchEditorAppearance({ fontSize: 20 })}>
        size 20
      </button>
      <button type="button" data-testid="appearance-code-wrap" onClick={() => patchEditorAppearance({ codeWrap: true })}>
        wrap new fences
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
        <pre data-testid="split-stored-text">{splitContent}</pre>
        <pre data-testid="markdown-preview">{preview}</pre>
        <pre data-testid="ai-request-text">{aiText}</pre>
        <pre data-testid="requested-page">{requestedPage}</pre>
        <pre data-testid="peek-navigated">{peekNavigated}</pre>
      </section>
    </main>
  );
}
