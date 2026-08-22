import { useSyncExternalStore } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { PAGE_HREF_PREFIX } from "@/lib/linkExtraction";
import { requestPagePeek } from "@/lib/pagePeek";
import type { PagePreview } from "./PageEmbedExtension";
import {
  PAGE_REF_NODE,
  displayTitleForPage,
  liftPageLinkMarks,
  pageRefHref,
  pageRefNodeJSON,
} from "./pageRef";

let pageRefRevision = 0;
const pageRefSubscribers = new Set<() => void>();

/** Repaint page-ref chips when titles change, without writing the document. */
export function refreshPageRefs(): void {
  pageRefRevision += 1;
  for (const notify of pageRefSubscribers) notify();
}

function subscribePageRefs(notify: () => void): () => void {
  pageRefSubscribers.add(notify);
  return () => {
    pageRefSubscribers.delete(notify);
  };
}

function readPageRefRevision(): number {
  return pageRefRevision;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageRef: {
      insertPageRef: (attrs: { pageId: string }) => ReturnType;
    };
  }
}

function PageRefView({
  node,
  getPages,
  getPagePreview,
}: NodeViewProps & {
  getPages: () => Array<{ id: string; title: string }>;
  getPagePreview?: (pageId: string) => PagePreview | null;
}) {
  useSyncExternalStore(subscribePageRefs, readPageRefRevision, readPageRefRevision);
  const pageId = String(node.attrs.pageId ?? "");
  const { title, missing } = displayTitleForPage(pageId, getPages());
  const preview = pageId ? getPagePreview?.(pageId) ?? null : null;
  const previewTitle = preview?.title || title;
  const previewBody = preview?.preview?.trim() ?? "";

  return (
    <NodeViewWrapper as="span" className="page-ref-wrap">
      <HoverCard openDelay={280} closeDelay={160}>
        <HoverCardTrigger asChild>
          <a
            href={pageRefHref(pageId)}
            className={`editor-link page-link page-ref${missing ? " page-ref-missing" : ""}`}
            data-type="page-ref"
            data-page-id={pageId}
            contentEditable={false}
          >
            {title}
          </a>
        </HoverCardTrigger>
        <HoverCardContent
          className="page-ref-preview z-[80] w-72 p-3"
          data-testid="page-ref-preview"
          sideOffset={8}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="truncate text-sm font-medium">{previewTitle}</p>
          {missing ? (
            <p className="mt-1 text-xs text-muted-foreground">Page not found</p>
          ) : previewBody ? (
            <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{previewBody}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No preview</p>
          )}
          {!missing && pageId ? (
            <button
              type="button"
              className="page-ref-peek mt-2 text-xs font-medium text-foreground underline-offset-2 hover:underline"
              data-testid="page-ref-peek"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                requestPagePeek(pageId);
              }}
            >
              Peek
            </button>
          ) : null}
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}

export function createPageRefExtension(
  getPages: () => Array<{ id: string; title: string }>,
  getPagePreview?: (pageId: string) => PagePreview | null,
) {
  return Node.create({
    name: PAGE_REF_NODE,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addOptions() {
      return { getPages, getPagePreview };
    },

    addAttributes() {
      return {
        pageId: {
          default: "",
          parseHTML: (el) => {
            const node = el as HTMLElement;
            const fromData = node.getAttribute("data-page-id") ?? "";
            if (fromData) return fromData;
            const href = node.getAttribute("href") ?? "";
            return href.startsWith(PAGE_HREF_PREFIX) ? href.slice(PAGE_HREF_PREFIX.length) : "";
          },
          renderHTML: (attrs) => (attrs.pageId ? { "data-page-id": attrs.pageId } : {}),
        },
      };
    },

    parseHTML() {
      return [
        { tag: 'a[data-type="page-ref"]', priority: 60 },
        { tag: `a[href^="${PAGE_HREF_PREFIX}"]`, priority: 60 },
        { tag: 'span[data-type="page-ref"]' },
      ];
    },

    renderHTML({ node, HTMLAttributes }) {
      const pageId = String(node.attrs.pageId ?? "");
      const { title } = displayTitleForPage(pageId, getPages());
      return [
        "a",
        mergeAttributes(HTMLAttributes, {
          href: pageRefHref(pageId),
          class: "editor-link page-link page-ref",
          "data-type": "page-ref",
          "data-page-id": pageId,
        }),
        title,
      ];
    },

    renderText({ node }) {
      return displayTitleForPage(String(node.attrs.pageId ?? ""), getPages()).title;
    },

    addNodeView() {
      const resolvePages = getPages;
      const resolvePreview = getPagePreview;
      return ReactNodeViewRenderer((props) => (
        <PageRefView {...props} getPages={resolvePages} getPagePreview={resolvePreview} />
      ));
    },

    addCommands() {
      return {
        insertPageRef:
          (attrs) =>
          ({ commands }) =>
            commands.insertContent(pageRefNodeJSON(attrs.pageId)),
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: new PluginKey("pageRefLift"),
          view() {
            const lifted = liftPageLinkMarks(editor.state);
            if (lifted) editor.view.dispatch(lifted as never);
            return {};
          },
          appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null;
            return liftPageLinkMarks(newState) as never;
          },
        }),
      ];
    },
  });
}

/** Standalone export for tests and type checks. */
export const PageRef = createPageRefExtension(() => []);
