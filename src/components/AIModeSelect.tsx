import { MessageCircle, ListChecks, Sparkles } from "@/lib/icons";
import {
  ASSISTANT_MODES,
  type AssistantMode,
} from "@/lib/ai/assistantMode";
import { cn } from "@/lib/utils";

const MODE_ICON = {
  ask: MessageCircle,
  plan: ListChecks,
  agent: Sparkles,
} as const;

interface Props {
  value: AssistantMode;
  onChange: (mode: AssistantMode) => void;
}

export function AIModeSelect({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="AI mode"
      className="flex shrink-0 rounded-md border border-border overflow-hidden"
    >
      {ASSISTANT_MODES.map((m) => {
        const Icon = MODE_ICON[m.id];
        const selected = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={m.description}
            onClick={() => onChange(m.id)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
              selected
                ? "bg-accent-soft text-accent-strong"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
