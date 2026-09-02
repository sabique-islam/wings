import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold, Italic, Strikethrough, Underline, Code, Link as LinkIcon, Sparkles,
  AlignLeft, AlignCenter, AlignRight, Type, ExternalLink, Copy, Pencil, Link2Off,
  Globe, Monitor, Eye, RefreshCw, Trash2, LayoutList,
} from "@/lib/icons";
import { requestPagePeek } from "@/lib/pagePeek";
import { toast } from "sonner";
import { TurnIntoDropdown, ColorDropdown } from "./ColorMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  activeLinkTarget,
  cardToolbarActions,
  convertActiveLinkToBookmark,
  convertActiveLinkToEmbed,
  convertSelectedCardToBookmark,
  convertSelectedCardToEmbed,
  convertSelectedCardToInline,
  copyHrefForTarget,
  copySelectedCardUrl,
  deleteSelectedCard,
  hrefPreview,
  linkToolbarActions,
  openActiveLink,
  openSelectedCard,
  refreshSelectedBookmark,
  selectedCard,
  shouldShowEditorBubble,
  shouldShowFormatButtons,
  toggleSelectedBookmarkListStyle,
  unlinkActiveLink,
  type ActiveLinkTarget,
  type CardToolbarAction,
  type LinkToolbarAction,
} from "./linkToolbar";

interface Props {
  editor: Editor;
  onSetLink: () => void;
}

const ALIGNMENTS = [
  { value: "left", label: "Left", icon: AlignLeft },
  { value: "center", label: "Center", icon: AlignCenter },
  { value: "right", label: "Right", icon: AlignRight },
] as const;

/** Matches the three faces Notion offers, resolved through the theme's stacks. */
const FONTS = [
  { label: "Default", value: null },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
] as const;

function copyText(value: string | null): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    toast.error("Nothing to copy");
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => toast.success("Copied URL"),
    () => toast.error("Couldn't copy"),
  );
}

function copyLinkHref(target: ActiveLinkTarget): void {
  copyText(copyHrefForTarget(target));
}

function LinkActions({
  editor,
  onSetLink,
  target,
  compact,
}: {
  editor: Editor;
  onSetLink: () => void;
  target: ActiveLinkTarget;
  compact: boolean;
}) {
  const actions = new Set(linkToolbarActions(target));
  const preview = hrefPreview(target);
  const run = (action: LinkToolbarAction) => {
    if (action === "open") openActiveLink(editor);
    else if (action === "peek" && target.kind === "page") requestPagePeek(target.pageId);
    else if (action === "copy") copyLinkHref(target);
    else if (action === "edit") onSetLink();
    else if (action === "unlink") unlinkActiveLink(editor);
    else if (action === "bookmark") convertActiveLinkToBookmark(editor);
    else if (action === "embed") convertActiveLinkToEmbed(editor);
  };

  return (
    <div className="link-toolbar" data-testid="link-toolbar">
      {preview ? (
        <span className="link-toolbar-href" title={preview}>
          {preview}
        </span>
      ) : null}
      {actions.has("open") ? (
        <button type="button" className="bubble-btn" title="Open" aria-label="Open" onClick={() => run("open")}>
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("peek") ? (
        <button type="button" className="bubble-btn" title="Peek" aria-label="Peek" onClick={() => run("peek")}>
          <Eye className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("copy") ? (
        <button
          type="button"
          className="bubble-btn"
          title="Copy URL"
          aria-label="Copy URL"
          onClick={() => run("copy")}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {compact && actions.has("edit") ? (
        <button type="button" className="bubble-btn" title="Edit" aria-label="Edit" onClick={() => run("edit")}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("unlink") ? (
        <button
          type="button"
          className="bubble-btn"
          title="Unlink"
          aria-label="Unlink"
          onClick={() => run("unlink")}
        >
          <Link2Off className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("bookmark") ? (
        <button
          type="button"
          className="bubble-btn bubble-btn-label"
          title="Turn into bookmark"
          aria-label="Turn into bookmark"
          onClick={() => run("bookmark")}
        >
          <Globe className="h-3.5 w-3.5" />
          Bookmark
        </button>
      ) : null}
      {actions.has("embed") ? (
        <button
          type="button"
          className="bubble-btn bubble-btn-label"
          title="Turn into embed"
          aria-label="Turn into embed"
          onClick={() => run("embed")}
        >
          <Monitor className="h-3.5 w-3.5" />
          Embed
        </button>
      ) : null}
    </div>
  );
}

function CardActions({ editor, kind, url }: { editor: Editor; kind: "bookmark" | "embed"; url: string }) {
  const actions = new Set(cardToolbarActions(kind, url));
  const run = (action: CardToolbarAction) => {
    if (action === "inline") convertSelectedCardToInline(editor);
    else if (action === "card") convertSelectedCardToBookmark(editor);
    else if (action === "embed") convertSelectedCardToEmbed(editor);
    else if (action === "copy") copyText(copySelectedCardUrl(editor));
    else if (action === "open") openSelectedCard(editor);
    else if (action === "reload") void refreshSelectedBookmark(editor);
    else if (action === "list") toggleSelectedBookmarkListStyle(editor);
    else if (action === "delete") deleteSelectedCard(editor);
  };

  return (
    <div className="link-toolbar" data-testid="card-toolbar">
      {actions.has("inline") ? (
        <button type="button" className="bubble-btn bubble-btn-label" title="Inline view" aria-label="Inline view" onClick={() => run("inline")}>
          Inline
        </button>
      ) : null}
      {actions.has("card") ? (
        <button
          type="button"
          className={`bubble-btn bubble-btn-label${kind === "bookmark" ? " is-active" : ""}`}
          title="Card view"
          aria-label="Card view"
          disabled={kind === "bookmark"}
          onClick={() => run("card")}
        >
          Card
        </button>
      ) : null}
      {actions.has("embed") ? (
        <button
          type="button"
          className={`bubble-btn bubble-btn-label${kind === "embed" ? " is-active" : ""}`}
          title="Embed view"
          aria-label="Embed view"
          disabled={kind === "embed"}
          onClick={() => run("embed")}
        >
          <Monitor className="h-3.5 w-3.5" />
          Embed
        </button>
      ) : null}
      {actions.has("copy") ? (
        <button type="button" className="bubble-btn" title="Copy URL" aria-label="Copy URL" onClick={() => run("copy")}>
          <Copy className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("open") ? (
        <button type="button" className="bubble-btn" title="Open" aria-label="Open" onClick={() => run("open")}>
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("reload") ? (
        <button type="button" className="bubble-btn" title="Reload preview" aria-label="Reload preview" onClick={() => run("reload")}>
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("list") ? (
        <button type="button" className="bubble-btn" title="Compact card" aria-label="Compact card" onClick={() => run("list")}>
          <LayoutList className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {actions.has("delete") ? (
        <button type="button" className="bubble-btn" title="Delete" aria-label="Delete" onClick={() => run("delete")}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Bubble toolbar — subscribes only to mark state, not every transaction. */
export function BubbleMenuToolbar({ editor, onSetLink }: Props) {
  const marks = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      underline: ed.isActive("underline"),
      strike: ed.isActive("strike"),
      code: ed.isActive("code"),
      link: ed.isActive("link"),
      pageRef: ed.isActive("pageRef"),
      empty: ed.state.selection.empty,
      align: ALIGNMENTS.find((a) => ed.isActive({ textAlign: a.value }))?.value ?? "left",
    }),
  });

  const card = selectedCard(editor);
  const cardActive = Boolean(card);
  const target = cardActive ? null : activeLinkTarget(editor);
  const showFormat = shouldShowFormatButtons({
    selectionEmpty: marks.empty,
    linkActive: Boolean(target) || marks.link,
    pageRefActive: marks.pageRef,
    cardActive,
  });

  return (
    <BubbleMenu
      editor={editor}
      className="bubble-menu"
      updateDelay={0}
      shouldShow={({ editor: ed, view, from, to, element }) =>
        shouldShowEditorBubble({
          editable: ed.isEditable,
          from,
          to,
          linkActive: Boolean(activeLinkTarget(ed)) || ed.isActive("link"),
          pageRefActive: ed.isActive("pageRef"),
          cardActive: ed.isActive("bookmark") || ed.isActive("embed"),
          viewFocused: view.hasFocus() || Boolean(element?.contains(document.activeElement)),
        })
      }
    >
      {showFormat ? (
        <>
          <TurnIntoDropdown editor={editor} />
          <div className="w-px h-4 bg-border mx-0.5" />
          <button
            onClick={() => (window as any).__nw_openInlineAI?.()}
            className="bubble-btn bubble-btn-ai"
            title="Ask AI"
            type="button"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`bubble-btn ${marks.bold ? "is-active" : ""}`}
            title="Bold (⌘B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`bubble-btn ${marks.italic ? "is-active" : ""}`}
            title="Italic (⌘I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`bubble-btn ${marks.underline ? "is-active" : ""}`}
            title="Underline (⌘U)"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`bubble-btn ${marks.strike ? "is-active" : ""}`}
            title="Strikethrough (⌘⇧S)"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`bubble-btn ${marks.code ? "is-active" : ""}`}
            title="Inline code (⌘E)"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button
            type="button"
            onClick={onSetLink}
            className={`bubble-btn ${marks.link ? "is-active" : ""}`}
            title="Link (⌘K)"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>
          <ColorDropdown editor={editor} />
          <div className="w-px h-4 bg-border mx-0.5" />
          {ALIGNMENTS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => editor.chain().focus().setTextAlign(value).run()}
              className={`bubble-btn ${marks.align === value ? "is-active" : ""}`}
              title={`Align ${label.toLowerCase()}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="bubble-btn" title="Font">
                <Type className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[120px]">
              {FONTS.map((font) => (
                <DropdownMenuItem
                  key={font.label}
                  style={font.value ? { fontFamily: font.value } : undefined}
                  onClick={() => {
                    if (font.value) editor.chain().focus().setFontFamily(font.value).run();
                    else editor.chain().focus().unsetFontFamily().run();
                  }}
                >
                  {font.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      {card ? <CardActions editor={editor} kind={card.kind} url={card.url} /> : null}
      {target ? (
        <>
          {showFormat ? <div className="w-px h-4 bg-border mx-0.5" /> : null}
          <LinkActions editor={editor} onSetLink={onSetLink} target={target} compact={!showFormat} />
        </>
      ) : null}
    </BubbleMenu>
  );
}
