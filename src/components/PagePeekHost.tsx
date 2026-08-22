import { useCallback, useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { BlockEditor } from "@/components/BlockEditor/BlockEditor";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PagePreview } from "@/components/BlockEditor/PageEmbedExtension";
import {
  PEEK_CLOSE_EVENT,
  PEEK_OPEN_EVENT,
  nextPeekPageId,
  peekEditorEntryId,
  requestClosePagePeek,
  resolvePeekEntry,
  type PeekEntry,
} from "@/lib/pagePeek";

type PeekSource = {
  id: string;
  title: string;
  content: string;
  content_json?: JSONContent | null;
};

interface Props {
  entries: ReadonlyArray<PeekSource>;
  pages: Array<{ id: string; title: string }>;
  getPagePreview?: (pageId: string) => PagePreview | null;
  onNavigate?: (pageId: string) => void;
}

export function PagePeekHost({ entries, pages, getPagePreview, onNavigate }: Props) {
  const [pageId, setPageId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const incoming = String((event as CustomEvent).detail ?? "");
      setPageId((current) => nextPeekPageId(current, incoming));
    };
    const onClose = () => setPageId(null);
    window.addEventListener(PEEK_OPEN_EVENT, onOpen);
    window.addEventListener(PEEK_CLOSE_EVENT, onClose);
    window.addEventListener("nw:navigate", onClose);
    return () => {
      window.removeEventListener(PEEK_OPEN_EVENT, onOpen);
      window.removeEventListener(PEEK_CLOSE_EVENT, onClose);
      window.removeEventListener("nw:navigate", onClose);
    };
  }, []);

  const entry: PeekEntry | null = pageId ? resolvePeekEntry(pageId, entries) : null;
  const open = Boolean(pageId);

  const goToPage = useCallback(() => {
    if (!entry) return;
    onNavigate?.(entry.id);
    requestClosePagePeek();
    setPageId(null);
  }, [entry, onNavigate]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPageId(null);
          requestClosePagePeek();
        }
      }}
    >
      <DialogContent
        className="page-peek-modal max-w-3xl max-h-[85vh] overflow-hidden flex flex-col gap-3 p-4 sm:p-6"
        data-testid="page-peek-modal"
        aria-describedby={undefined}
      >
        <DialogTitle className="min-w-0 pr-8">
          {entry ? (
            <button
              type="button"
              className="page-peek-title truncate text-left text-lg font-semibold hover:underline"
              onClick={goToPage}
            >
              {entry.title}
            </button>
          ) : (
            "Page not found"
          )}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Read-only preview. The current page is not saved from this view.
        </DialogDescription>
        {entry ? (
          <div className="page-peek-body min-h-0 flex-1 overflow-y-auto">
            <BlockEditor
              key={entry.id}
              peek
              entryId={peekEditorEntryId(entry.id)}
              content={entry.content}
              contentJson={entry.content_json}
              pages={pages}
              getPagePreview={getPagePreview}
              editable={false}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This page is not in the workspace.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
