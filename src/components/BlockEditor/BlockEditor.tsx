import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { markdownToHtml, htmlToMarkdown } from "@/lib/markdown";
import { insertBookmark, insertEmbed, looksLikeMarkdown, pasteExternalUrl, updateBookmarkMeta, extractSingleLinkFromHtml } from "./blockCommands";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { createBlockEditorExtensions } from "./editorExtensions";
import { BlockMenu } from "./BlockMenu";
import { BlockContextMenu } from "./BlockContextMenu";
import { BlockActionMenu } from "./BlockActionMenu";
import { BubbleMenuToolbar } from "./BubbleMenuToolbar";
import { TableMenu } from "./TableMenu";
import { EditorPopoverInput, promptEditorInput } from "./EditorPopoverInput";
import { isSafeHttpUrl } from "@/lib/safeUrl";
import { applyEditorLinkAction, resolveEditorLinkAction } from "./editorLinkClick";
import { fetchLinkPreview } from "@/lib/linkPreview";
import type { EditorChangePayload, FullEditorChangePayload } from "@/lib/editorPayload";
import { resolveInitialEditorContent, shouldSyncEditorFromProps } from "@/lib/editorContent";
import { createCollabExtensions } from "@/lib/collab/collabExtensions";
import type { CollabSession } from "@/lib/collab/useCollabProvider";
import type { PageOption } from "./PageMentionExtension";
import type { PagePreview } from "./PageEmbedExtension";
import { toast } from "sonner";
import { Fragment, Slice } from "@tiptap/pm/model";
import { isSelectionInCodeBlock } from "./blockUtils";

const SERIALIZE_DEBOUNCE_MS = 200;
const URL_ONLY = /^https?:\/\/[^\s]+$/i;

interface Props {
  entryId: string;
  content: string;
  contentJson?: JSONContent | null;
  onChange: (payload: EditorChangePayload) => void;
  onImageUpload?: (file?: File) => void;
  onLinkPage?: () => void;
  onEmbedPage?: () => void;
  onNewPage?: (title: string) => void;
  onAskAI?: () => void;
  pages?: PageOption[];
  getPagePreview?: (pageId: string) => PagePreview | null;
  editable?: boolean;
  collabSession?: CollabSession | null;
}

function resolveInitialContent(
  content: string,
  contentJson?: JSONContent | null,
  resolvePageId?: (title: string) => string | null,
): string | JSONContent {
  return resolveInitialEditorContent(content, contentJson, resolvePageId);
}

type MountedEditor = NonNullable<ReturnType<typeof useEditor>>;

function pastePlainParagraphs(view: import("@tiptap/pm/view").EditorView, text: string): boolean {
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) return false;
  const { schema } = view.state;
  const nodes = lines.map((line) =>
    schema.nodes.paragraph.create(null, line ? schema.text(line) : undefined),
  );
  // Fragment.from expects nodes from the same schema instance as view.state.doc
  const fragment = Fragment.from(nodes as Parameters<typeof Fragment.from>[0]);
  const tr = view.state.tr.replaceSelection(new Slice(fragment, 0, 0));
  view.dispatch(tr);
  return true;
}

/**
 * Memoized: the journal shell re-renders on save-status and entry-list updates,
 * and none of that should reconcile the subtree the user is typing into.
 */
export const BlockEditor = memo(function BlockEditor({
  entryId,
  content,
  contentJson,
  onChange,
  onImageUpload,
  onLinkPage,
  onEmbedPage,
  onNewPage,
  onAskAI,
  pages = [],
  getPagePreview,
  editable = true,
  collabSession = null,
}: Props) {
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  /** Recovers the page id for `![[Title]]` embeds authored outside the editor. */
  const resolvePageIdByTitle = useCallback((title: string) => {
    const wanted = title.trim().toLowerCase();
    return pagesRef.current.find((page) => page.title.trim().toLowerCase() === wanted)?.id ?? null;
  }, []);
  const resolvedContent = useMemo(
    () => resolveInitialContent(content, contentJson, resolvePageIdByTitle),
    [entryId, content, contentJson, resolvePageIdByTitle],
  );
  const lastEmittedMarkdown = useRef(content);
  const lastEmittedJson = useRef<JSONContent | null>(contentJson ?? null);
  const localVersion = useRef(0);
  const acceptedVersion = useRef(0);
  /**
   * `localVersion` at which `lastEmittedMarkdown` was rendered, or -1 when no
   * full serialize has run yet. Never seed this from the props: markdown and
   * JSON only describe the same document once the editor has serialized both,
   * and persisting a mismatched pair is what `resolveInitialEditorContent`
   * exists to recover from.
   */
  const markdownVersion = useRef(-1);
  const loadedEntryId = useRef(entryId);
  const serializeTimer = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<MountedEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const getPagePreviewRef = useRef(getPagePreview);
  getPagePreviewRef.current = getPagePreview;
  onChangeRef.current = onChange;

  const extraExtensions = useMemo(
    () =>
      collabSession
        ? createCollabExtensions(collabSession.ydoc, collabSession.provider, collabSession.user)
        : [],
    [collabSession],
  );

  const extensions = useMemo(
    () =>
      createBlockEditorExtensions({
        onImageUpload,
        onLinkPage,
        onEmbedPage,
        onNewPage,
        onAskAI,
        getPages: pages.length > 0 ? () => pagesRef.current : undefined,
        getPagePreview: (pageId) => getPagePreviewRef.current?.(pageId) ?? null,
        collab: !!collabSession,
        extraExtensions,
      }),
    [
      collabSession,
      extraExtensions,
      onAskAI,
      onImageUpload,
      onLinkPage,
      onEmbedPage,
      onNewPage,
      pages.length,
      // getPagePreview is read through a ref so identity churn from the parent
      // cannot rebuild the suggestion plugins mid-session.
    ],
  );

  /**
   * Full serialize — getHTML plus a Turndown pass over the whole document.
   * This is the expensive half, so it only runs where someone is about to read
   * the markdown: blur, unmount, and the flush the save pipeline requests.
   */
  const serializeFull = useCallback((editor: MountedEditor): FullEditorChangePayload => {
    if (serializeTimer.current) clearTimeout(serializeTimer.current);
    // Blur fires on every click outside the editor and the save pipeline asks
    // again on its own schedule, so most full serializes see an unchanged
    // document. Reuse the last markdown rather than walking the whole doc again.
    if (markdownVersion.current === localVersion.current && lastEmittedJson.current) {
      return { markdown: lastEmittedMarkdown.current, json: lastEmittedJson.current };
    }
    const markdown = htmlToMarkdown(editor.getHTML());
    const json = editor.getJSON();
    lastEmittedMarkdown.current = markdown;
    lastEmittedJson.current = json;
    markdownVersion.current = localVersion.current;
    (window as any).__nw_currentMarkdown = markdown;
    return { markdown, json };
  }, []);

  const emitFull = useCallback((editor: MountedEditor) => {
    onChangeRef.current(serializeFull(editor));
  }, [serializeFull]);

  /** Typing path — JSON only, so keystrokes never wait on markdown rendering. */
  const scheduleJsonEmit = useCallback((editor: MountedEditor) => {
    if (serializeTimer.current) clearTimeout(serializeTimer.current);
    serializeTimer.current = setTimeout(() => {
      const json = editor.getJSON();
      lastEmittedJson.current = json;
      // Typing updates JSON ahead of markdown (`serializeFull` is deferred).
      // Invalidate the markdown cache so the next full serialize re-renders HTML.
      markdownVersion.current = -1;
      onChangeRef.current({ json });
    }, SERIALIZE_DEBOUNCE_MS);
  }, []);

  const editor = useEditor({
    extensions,
    content: resolvedContent,
    editable,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: "block-editor-content focus:outline-none",
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files?.length) {
          const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
          if (imageFiles.length) {
            event.preventDefault();
            imageFiles.forEach((f) => onImageUpload?.(f));
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItems = items.filter((item) => item.type.startsWith("image/"));
        if (imageItems.length) {
          event.preventDefault();
          for (const item of imageItems) {
            const file = item.getAsFile();
            if (file) onImageUpload?.(file);
          }
          return true;
        }

        const html = event.clipboardData?.getData("text/html")?.trim() ?? "";
        const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";

        // Multi-line / HTML / markdown paste handlers create paragraph nodes, which
        // break code blocks. Keep clipboard content as plain text inside fences.
        if (isSelectionInCodeBlock(view.state.selection.$from)) {
          const plain = event.clipboardData?.getData("text/plain") ?? "";
          if (plain.length > 0) {
            event.preventDefault();
            view.dispatch(view.state.tr.insertText(plain));
            return true;
          }
          return false;
        }

        const urlFromText = text && URL_ONLY.test(text) && isSafeHttpUrl(text) ? text : null;
        const urlFromHtml = extractSingleLinkFromHtml(html);
        const externalUrl = urlFromText ?? urlFromHtml;

        if (externalUrl) {
          event.preventDefault();
          event.stopPropagation();
          const ed = editorRef.current;
          if (ed) {
            const bookmarkPos = pasteExternalUrl(ed, externalUrl);
            if (bookmarkPos != null) {
              void fetchLinkPreview(externalUrl).then((meta) => {
                if (meta && editorRef.current) {
                  updateBookmarkMeta(editorRef.current, bookmarkPos, meta);
                }
              });
              return true;
            }
          }
          return true;
        }

        if (html && html.includes("<")) {
          event.preventDefault();
          view.pasteHTML(html);
          return true;
        }

        if (text && looksLikeMarkdown(text) && !html) {
          event.preventDefault();
          view.pasteHTML(markdownToHtml(text));
          return true;
        }

        if (text && text.includes("\n")) {
          event.preventDefault();
          pastePlainParagraphs(view, text);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (!transaction.docChanged) return;
      localVersion.current += 1;
      scheduleJsonEmit(ed);
    },
    onBlur: ({ editor: ed }) => {
      emitFull(ed);
    },
  }, [collabSession, entryId]);

  useEffect(() => {
    if (loadedEntryId.current === entryId) return;
    loadedEntryId.current = entryId;
    localVersion.current = 0;
    acceptedVersion.current = 0;
    markdownVersion.current = -1;
    lastEmittedMarkdown.current = content;
    lastEmittedJson.current = contentJson ?? null;
    if (!editor) return;
    editor.commands.setContent(resolvedContent, { emitUpdate: false });
  }, [entryId, content, contentJson, editor, resolvedContent]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editable, editor]);

  /** Resolve a `#block=<id>` permalink once the document has rendered. */
  useEffect(() => {
    if (!editor) return;
    const blockId = window.location.hash.startsWith("#block=")
      ? window.location.hash.slice("#block=".length)
      : "";
    if (!blockId) return;
    const timer = setTimeout(() => {
      const target = editor.view.dom.querySelector(`[id="${CSS.escape(blockId)}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("nw-block-flash");
      setTimeout(() => target.classList.remove("nw-block-flash"), 1600);
    }, 150);
    return () => clearTimeout(timer);
  }, [editor, entryId]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    // External entry state changed (fetch, draft merge, version restore).
    // See `shouldSyncEditorFromProps` — markdown alone is not enough while typing
    // emits JSON-only drafts between full serializes.
    if (
      !shouldSyncEditorFromProps(
        content,
        contentJson,
        lastEmittedMarkdown.current,
        lastEmittedJson.current,
      )
    ) {
      return;
    }
    if (localVersion.current !== acceptedVersion.current) return;
    const next = resolveInitialContent(content, contentJson, resolvePageIdByTitle);
    editor.commands.setContent(next, { emitUpdate: false });
    lastEmittedMarkdown.current = content;
    lastEmittedJson.current = contentJson ?? null;
    // The document changed without an update transaction, so `localVersion` is
    // unchanged and can no longer vouch for the cached markdown.
    markdownVersion.current = -1;
    acceptedVersion.current = localVersion.current;
  }, [content, contentJson, editor, resolvePageIdByTitle]);

  const setLink = useCallback(async () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = await promptEditorInput({
      kind: "url",
      title: "Link URL",
      placeholder: "https://…",
      defaultValue: previousUrl,
    });
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !editor.isFocused) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        void setLink();
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        editor.chain().focus().toggleStrike().run();
      }
      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        editor.chain().focus().toggleUnderline().run();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor, setLink]);

  const insertImage = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    (window as any).__nw_insertImage = insertImage;
    (window as any).__nw_editor = editor;
    (window as any).__nw_getMarkdown = () => htmlToMarkdown(editor.getHTML());
    // Entry-scoped: a save scheduled before navigation must not be handed the
    // next page's document.
    (window as any).__nw_flushEditor = (id?: string) =>
      id == null || id === entryId ? serializeFull(editor) : null;
    (window as any).__nw_currentMarkdown = htmlToMarkdown(editor.getHTML());

    const onSlashPrompt = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        type: "bookmark" | "embed" | "newPage";
        editor: typeof editor;
      };
      if (detail.type === "newPage") {
        const title = await promptEditorInput({
          kind: "text",
          title: "New page title",
          defaultValue: "Untitled",
        });
        if (title) onNewPage?.(title);
        return;
      }
      const url = await promptEditorInput({
        kind: "url",
        title: detail.type === "bookmark" ? "Paste URL for bookmark" : "Paste embed URL",
        placeholder: "https://…",
      });
      if (!url) return;
      if (detail.type === "bookmark") {
        const meta = await fetchLinkPreview(url);
        if (!insertBookmark(detail.editor, url, meta ?? undefined)) {
          toast.error("Only http(s) links can be bookmarked");
        }
      } else if (!insertEmbed(detail.editor, url)) {
        toast.error("Embeds are only allowed from trusted https sources");
      }
    };
    window.addEventListener("nw:slashPrompt", onSlashPrompt);

    return () => {
      editorRef.current = null;
      delete (window as any).__nw_insertImage;
      delete (window as any).__nw_editor;
      delete (window as any).__nw_getMarkdown;
      delete (window as any).__nw_flushEditor;
      delete (window as any).__nw_currentMarkdown;
      window.removeEventListener("nw:slashPrompt", onSlashPrompt);
      if (serializeTimer.current) clearTimeout(serializeTimer.current);
      if (editor && !editor.isDestroyed) {
        emitFull(editor);
      }
    };
  }, [insertImage, editor, serializeFull, emitFull, onNewPage, entryId]);

  if (!editor) return null;

  return (
    <div
      className="block-editor-wrapper w-full min-w-0"
      onClickCapture={(e) => {
        // Capture so ProseMirror / node views cannot swallow the click before we open.
        const anchor = (e.target as HTMLElement).closest("a");
        if (!anchor || !e.currentTarget.contains(anchor)) return;
        // Bookmark cards already use <a target="_blank"> — let the browser handle them.
        if (anchor.classList.contains("bookmark-card")) return;
        const href = anchor.getAttribute("href");
        const action = resolveEditorLinkAction({
          href,
          editable,
          modKey: e.metaKey || e.ctrlKey,
          middleClick: false,
        });
        if (action.type === "ignore") return;
        e.preventDefault();
        e.stopPropagation();
        applyEditorLinkAction(action);
      }}
      onAuxClickCapture={(e) => {
        if (e.button !== 1) return;
        const anchor = (e.target as HTMLElement).closest("a");
        if (!anchor || !e.currentTarget.contains(anchor)) return;
        if (anchor.classList.contains("bookmark-card")) return;
        const href = anchor.getAttribute("href");
        const action = resolveEditorLinkAction({
          href,
          editable,
          modKey: false,
          middleClick: true,
        });
        if (action.type === "ignore") return;
        e.preventDefault();
        e.stopPropagation();
        applyEditorLinkAction(action);
      }}
    >
      <EditorPopoverInput />
      <BlockMenu editor={editor} />
      <BlockActionMenu editor={editor} />
      {editable && <BlockContextMenu editor={editor} />}
      {editor && editable && (
        <>
          <BubbleMenuToolbar editor={editor} onSetLink={setLink} />
          <TableMenu editor={editor} />
        </>
      )}
      <EditorContent editor={editor} className="w-full min-w-0" />
    </div>
  );
});
