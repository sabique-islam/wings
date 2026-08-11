import type { Editor } from "@tiptap/core";
import { turnInto, TURN_INTO_ITEMS, TEXT_COLORS, BG_COLORS } from "./blockCommands";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Palette } from "@/lib/icons";

const TURN_INTO = TURN_INTO_ITEMS;

export function TurnIntoDropdown({ editor }: { editor: Editor }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="bubble-btn flex items-center gap-0.5 text-[10px] px-1.5" title="Turn into">
          Turn <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {TURN_INTO.map((t) => (
          <DropdownMenuItem key={t.type} onClick={() => turnInto(editor, t.type)}>
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ColorDropdown({ editor }: { editor: Editor }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="bubble-btn" title="Color">
          <Palette className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Text color</p>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              className="color-swatch"
              style={{ background: c.value || "hsl(var(--foreground))" }}
              title={c.label}
              onClick={() => {
                if (c.value) editor.chain().focus().setColor(c.value).run();
                else editor.chain().focus().unsetColor().run();
              }}
            />
          ))}
        </div>
        <DropdownMenuSeparator />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Background</p>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {BG_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              className="color-swatch border border-border"
              style={{ background: c.value || "transparent" }}
              title={c.label}
              onClick={() => {
                if (c.value) editor.chain().focus().toggleHighlight({ color: c.value }).run();
                else editor.chain().focus().unsetHighlight().run();
              }}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
