import { useEffect, useState } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import {
  AtSign,
  Bold,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  Redo2,
  Undo2,
} from "@/lib/icons";
import { turnInto } from "./blockCommands";
import { indentCurrentBlock, outdentCurrentBlock } from "./outlineNest";
import {
  KEYBOARD_TOOLBAR_MEDIA,
  MOBILE_TURN_INTO,
  insertSuggestionChar,
  keyboardToolbarOffset,
  preventEditorBlur,
  toggleToolbarMark,
} from "./mobileToolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function useShowKeyboardToolbar(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(KEYBOARD_TOOLBAR_MEDIA).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(KEYBOARD_TOOLBAR_MEDIA);
    const sync = () => setVisible(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return visible;
}

interface Props {
  editor: Editor;
  onSetLink: () => void;
}

export function MobileKeyboardToolbar({ editor, onSetLink }: Props) {
  const [bottom, setBottom] = useState(0);
  const marks = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      link: ed.isActive("link"),
      undo: ed.can().undo(),
      redo: ed.can().redo(),
    }),
  });

  useEffect(() => {
    const viewport = window.visualViewport;
    const sync = () => {
      if (!viewport) {
        setBottom(0);
        return;
      }
      setBottom(keyboardToolbarOffset(viewport, window.innerHeight));
    };
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      className="mobile-keyboard-toolbar"
      data-testid="mobile-keyboard-toolbar"
      role="toolbar"
      aria-label="Formatting"
      style={{ bottom }}
      onMouseDown={preventEditorBlur}
    >
      <button
        type="button"
        className="mobile-kb-btn"
        aria-label="Undo"
        disabled={!marks.undo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="mobile-kb-btn"
        aria-label="Redo"
        disabled={!marks.redo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <div className="mobile-kb-sep" />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="mobile-kb-btn mobile-kb-turn" aria-label="Turn into">
            Turn
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {MOBILE_TURN_INTO.map((item) => (
            <DropdownMenuItem key={item.type} onClick={() => turnInto(editor, item.type)}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        className={`mobile-kb-btn ${marks.bold ? "is-active" : ""}`}
        aria-label="Bold"
        aria-pressed={marks.bold}
        onClick={() => toggleToolbarMark(editor, "bold")}
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`mobile-kb-btn ${marks.italic ? "is-active" : ""}`}
        aria-label="Italic"
        aria-pressed={marks.italic}
        onClick={() => toggleToolbarMark(editor, "italic")}
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`mobile-kb-btn ${marks.link ? "is-active" : ""}`}
        aria-label="Link"
        aria-pressed={marks.link}
        onClick={onSetLink}
      >
        <LinkIcon className="h-4 w-4" />
      </button>
      <div className="mobile-kb-sep" />
      <button
        type="button"
        className="mobile-kb-btn"
        aria-label="Indent"
        onClick={() => indentCurrentBlock(editor)}
      >
        <IndentIncrease className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="mobile-kb-btn"
        aria-label="Outdent"
        onClick={() => outdentCurrentBlock(editor)}
      >
        <IndentDecrease className="h-4 w-4" />
      </button>
      <div className="mobile-kb-sep" />
      <button
        type="button"
        className="mobile-kb-btn mobile-kb-char"
        aria-label="Slash commands"
        onClick={() => insertSuggestionChar(editor, "/")}
      >
        /
      </button>
      <button
        type="button"
        className="mobile-kb-btn"
        aria-label="Mention page"
        onClick={() => insertSuggestionChar(editor, "@")}
      >
        <AtSign className="h-4 w-4" />
      </button>
    </div>
  );
}
