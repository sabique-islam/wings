import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import { slashCommandSuggestionKey } from "./suggestionPluginKeys";
import tippy, { Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from "react";
import {
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Minus,
  Code2, Image, Type, AlertCircle, ChevronRight, ChevronUp, ChevronDown, FileText, Table,
  Link as LinkIcon, ExternalLink, Columns, Sigma, Calculator, Calendar, CalendarCheck,
  Sparkles, FilePlus2, Layout, PenLine, BookOpen, Table2, RefreshCw,
  Copy, Trash2, Bold, Italic, Underline, Plus,
} from "@/lib/icons";
import { TEMPLATES } from "@/lib/templates";
import {
  copyCurrentBlock,
  deleteCurrentBlock,
  duplicateBlock,
  fuzzyMatch,
  insertTemplateMarkdown,
  moveBlock,
} from "./blockCommands";
import { slashDateText } from "./slashDates";
import { insertWeeklyPlanner } from "./templateButton";

export interface CommandItem {
  title: string;
  description: string;
  icon: React.ElementType;
  category: string;
  aliases?: string[];
  command: (props: { editor: any; range: any }) => void;
}

interface SlashHandlers {
  onImageUpload?: () => void;
  onLinkPage?: () => void;
  onEmbedPage?: () => void;
  onNewPage?: (title: string) => void;
  onAskAI?: () => void;
}

function insertSlashDate(editor: { chain: () => any }, range: { from: number; to: number }, kind: "today" | "tomorrow" | "yesterday" | "now") {
  editor.chain().focus().deleteRange(range).insertContent(slashDateText(kind)).run();
}

function toggleSlashMark(
  editor: any,
  range: { from: number; to: number },
  mark: "toggleBold" | "toggleItalic" | "toggleUnderline",
) {
  editor.chain().focus().deleteRange(range).run();
  const { $from } = editor.state.selection;
  if ($from.parent?.isTextblock && $from.parent.content.size > 0) {
    editor.chain().setTextSelection({ from: $from.start(), to: $from.end() })[mark]().run();
    return;
  }
  editor.chain()[mark]().run();
}

const getSuggestionItems = (h: SlashHandlers = {}): CommandItem[] => [
  {
    title: "Ask AI",
    description: "Write with AI from a prompt",
    icon: Sparkles,
    category: "AI",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      h.onAskAI?.();
    },
  },
  {
    title: "Duplicate",
    description: "Copy this block below",
    icon: Copy,
    category: "Actions",
    aliases: ["dup", "duplicate"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      duplicateBlock(editor);
    },
  },
  {
    title: "Move up",
    description: "Swap with the block above",
    icon: ChevronUp,
    category: "Actions",
    aliases: ["move up"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      moveBlock(editor, "up");
    },
  },
  {
    title: "Move down",
    description: "Swap with the block below",
    icon: ChevronDown,
    category: "Actions",
    aliases: ["move down"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      moveBlock(editor, "down");
    },
  },
  {
    title: "Copy",
    description: "Copy this block to the clipboard",
    icon: Copy,
    category: "Actions",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      copyCurrentBlock(editor);
    },
  },
  {
    title: "Delete",
    description: "Remove this block",
    icon: Trash2,
    category: "Actions",
    aliases: ["remove", "del", "delete"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      deleteCurrentBlock(editor);
    },
  },
  {
    title: "Bold",
    description: "Bold the current block",
    icon: Bold,
    category: "Format",
    command: ({ editor, range }) => toggleSlashMark(editor, range, "toggleBold"),
  },
  {
    title: "Italic",
    description: "Italicize the current block",
    icon: Italic,
    category: "Format",
    command: ({ editor, range }) => toggleSlashMark(editor, range, "toggleItalic"),
  },
  {
    title: "Underline",
    description: "Underline the current block",
    icon: Underline,
    category: "Format",
    command: ({ editor, range }) => toggleSlashMark(editor, range, "toggleUnderline"),
  },
  {
    title: "Text",
    description: "Plain text block",
    icon: Type,
    category: "Basic",
    aliases: ["p", "paragraph", "plain"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large heading",
    icon: Heading1,
    category: "Basic",
    aliases: ["h1", "title", "#"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    icon: Heading2,
    category: "Basic",
    aliases: ["h2", "##"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    icon: Heading3,
    category: "Basic",
    aliases: ["h3", "###"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: List,
    category: "Lists",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: ListOrdered,
    category: "Lists",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "To-do List",
    description: "Checklist with toggles",
    icon: CheckSquare,
    category: "Basic",
    aliases: ["todo", "task", "checkbox", "check"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Database",
    description: "Simple table with rows and columns",
    icon: Table2,
    category: "Advanced",
    aliases: ["db", "board", "table db"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertDatabase().run();
    },
  },
  {
    title: "Synced block",
    description: "Content that stays in sync when duplicated",
    icon: RefreshCw,
    category: "Advanced",
    aliases: ["sync", "synced", "linked block"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertSyncedBlock().run();
    },
  },
  {
    title: "Table",
    description: "Add a simple table",
    icon: Table,
    category: "Advanced",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: "Quote",
    description: "Block quote",
    icon: Quote,
    category: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setBlockquote().run();
    },
  },
  {
    title: "Code Block",
    description: "Code with syntax highlighting",
    icon: Code2,
    category: "Advanced",
    aliases: ["code", "snippet", "```"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run();
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: Minus,
    category: "Basic",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Callout",
    description: "Highlighted info block",
    icon: AlertCircle,
    category: "Advanced",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCallout().run();
    },
  },
  {
    title: "Toggle",
    description: "Collapsible content",
    icon: ChevronRight,
    category: "Advanced",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setToggleBlock().run();
    },
  },
  {
    title: "Image",
    description: "Upload or paste image",
    icon: Image,
    category: "Media",
    aliases: ["img", "photo", "picture"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      h.onImageUpload?.();
    },
  },
  {
    title: "Math (block)",
    description: "LaTeX equation block — $$…$$",
    icon: Sigma,
    category: "Advanced",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setBlockMath("").run();
    },
  },
  {
    title: "Math (inline)",
    description: "Inline LaTeX — $E=mc^2$",
    icon: Calculator,
    category: "Advanced",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setInlineMath("").run();
    },
  },
  {
    title: "Today",
    description: "Insert today's date",
    icon: CalendarCheck,
    category: "Date",
    aliases: ["date", "today"],
    command: ({ editor, range }) => insertSlashDate(editor, range, "today"),
  },
  {
    title: "Tomorrow",
    description: "Insert tomorrow's date",
    icon: Calendar,
    category: "Date",
    aliases: ["tomorr", "tomorrow"],
    command: ({ editor, range }) => insertSlashDate(editor, range, "tomorrow"),
  },
  {
    title: "Yesterday",
    description: "Insert yesterday's date",
    icon: Calendar,
    category: "Date",
    command: ({ editor, range }) => insertSlashDate(editor, range, "yesterday"),
  },
  {
    title: "Now",
    description: "Insert the current time",
    icon: Calendar,
    category: "Date",
    aliases: ["time"],
    command: ({ editor, range }) => insertSlashDate(editor, range, "now"),
  },
  {
    title: "Two columns",
    description: "Side-by-side layout",
    icon: Layout,
    category: "Advanced",
    aliases: ["columns", "col", "2col"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertColumnList(2).run();
    },
  },
  {
    title: "Three columns",
    description: "Three-column layout",
    icon: Columns,
    category: "Advanced",
    aliases: ["3col", "three columns"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertColumnList(3).run();
    },
  },
  {
    title: "Four columns",
    description: "Four-column layout",
    icon: Columns,
    category: "Advanced",
    aliases: ["4c", "four columns", "4col"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertColumnList(4).run();
    },
  },
  {
    title: "Five columns",
    description: "Five-column layout",
    icon: Columns,
    category: "Advanced",
    aliases: ["5c", "five columns", "5col"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertColumnList(5).run();
    },
  },
  {
    title: "Button",
    description: "Insert a copy of blocks on click",
    icon: Plus,
    category: "Advanced",
    aliases: ["template button", "new week"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTemplateButton({ label: "Insert" }).run();
    },
  },
  {
    title: "New sub-page",
    description: "Create a new page nested here",
    icon: FilePlus2,
    category: "Pages",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(
        new CustomEvent("nw:slashPrompt", { detail: { type: "newPage", editor } }),
      );
    },
  },
  {
    title: "Link to Page",
    description: "Insert link to another page",
    icon: FileText,
    category: "Pages",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      h.onLinkPage?.();
    },
  },
  {
    title: "Embed Page",
    description: "Show another page inline",
    icon: BookOpen,
    category: "Pages",
    aliases: ["transclude", "embed page", "![["],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      h.onEmbedPage?.();
    },
  },
  {
    title: "Drawing",
    description: "Sketch on an Excalidraw canvas",
    icon: PenLine,
    category: "Media",
    aliases: ["excalidraw", "sketch", "canvas", "draw"],
    command: ({ editor, range }) => {
      const sceneId = `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "excalidrawDrawing", attrs: { sceneId } })
        .run();
      window.dispatchEvent(new CustomEvent("nw:editDrawing", { detail: { sceneId } }));
    },
  },
  {
    title: "Web Bookmark",
    description: "Embed a link with preview",
    icon: ExternalLink,
    category: "Media",
    aliases: ["bookmark", "link preview"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(
        new CustomEvent("nw:slashPrompt", { detail: { type: "bookmark", editor } }),
      );
    },
  },
  {
    title: "Embed",
    description: "YouTube, Figma, or any iframe",
    icon: Columns,
    category: "Media",
    aliases: ["iframe", "youtube", "video"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(
        new CustomEvent("nw:slashPrompt", { detail: { type: "embed", editor } }),
      );
    },
  },
  // Templates
  ...TEMPLATES.map<CommandItem>((tpl) => ({
    title: tpl.name,
    description: tpl.description,
    icon: tpl.icon,
    category: "Templates",
    aliases: tpl.id === "weekly" ? ["weekly", "planner", "week"] : undefined,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      if (tpl.id === "weekly") {
        insertWeeklyPlanner(editor);
        return;
      }
      insertTemplateMarkdown(editor, tpl.content);
    },
  })),
];

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

export const CommandList = forwardRef<any, CommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (!items.length) return false;
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="bg-card border border-border rounded-md p-2 shadow-lg">
          <p className="text-[11px] text-muted-foreground px-2 py-1">No results</p>
        </div>
      );
    }

    // Group by category
    const categories: { label: string; items: { item: CommandItem; globalIndex: number }[] }[] = [];
    const catMap = new Map<string, { item: CommandItem; globalIndex: number }[]>();
    items.forEach((item, index) => {
      const cat = item.category || "Other";
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push({ item, globalIndex: index });
    });
    catMap.forEach((catItems, label) => categories.push({ label, items: catItems }));

    return (
      <div className="slash-menu bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-[380px] overflow-y-auto min-w-[320px]">
        {categories.map((cat) => (
          <div key={cat.label}>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 px-3 pt-2 pb-1">{cat.label}</p>
            {cat.items.map(({ item, globalIndex }) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  onClick={() => selectItem(globalIndex)}
                  className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                    globalIndex === selectedIndex
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
);
CommandList.displayName = "CommandList";

export function createSlashCommandExtension(handlers: SlashHandlers = {}) {
  return Extension.create({
    name: "slashCommand",
    // Above WritingExperience (200) so Enter and the arrow keys reach the open
    // menu instead of splitting the block underneath it.
    priority: 500,
    addOptions() {
      return {
        suggestion: {
          char: "/",
          command: ({ editor, range, props }: any) => {
            props.command({ editor, range });
          },
          items: ({ query }: { query: string }) => {
            const q = query.trim();
            if (!q) return getSuggestionItems(handlers);
            return getSuggestionItems(handlers)
              .map((item) => ({
                item,
                score: Math.max(
                  fuzzyMatch(q, item.title, item.aliases),
                  fuzzyMatch(q, item.description, item.aliases),
                ),
              }))
              .filter(({ score }) => score > 0)
              .sort((a, b) => b.score - a.score)
              .map(({ item }) => item);
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(CommandList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate(props: any) {
                component?.updateProps(props);
                if (popup?.[0] && props.clientRect) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                  });
                }
              },
              onKeyDown(props: any) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }
                return (component?.ref as any)?.onKeyDown(props) ?? false;
              },
              onExit() {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        } satisfies Partial<SuggestionOptions>,
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          pluginKey: slashCommandSuggestionKey,
        }),
      ];
    },
  });
}
