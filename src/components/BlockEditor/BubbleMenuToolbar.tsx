import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold, Italic, Strikethrough, Underline, Code, Link as LinkIcon, Sparkles,
  AlignLeft, AlignCenter, AlignRight, Type,
} from "@/lib/icons";
import { TurnIntoDropdown, ColorDropdown } from "./ColorMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      align: ALIGNMENTS.find((a) => ed.isActive({ textAlign: a.value }))?.value ?? "left",
    }),
  });

  return (
    <BubbleMenu editor={editor} className="bubble-menu">
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
    </BubbleMenu>
  );
}
