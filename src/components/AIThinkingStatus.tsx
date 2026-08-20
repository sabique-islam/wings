import { ThinkingOrb } from "thinking-orbs";
import type { OrbState } from "thinking-orbs";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  size?: 20 | 64;
  state?: OrbState;
  className?: string;
}

/** Canvas thinking-orb used while the assistant generates a reply. */
export function AIThinkingStatus({
  label = "Thinking",
  size = 64,
  state = "composing",
  className,
}: Props) {
  return (
    <div
      className={cn("inline-flex items-center", size === 64 ? "gap-3" : "gap-1.5", className)}
      role="status"
      aria-live="polite"
    >
      <ThinkingOrb state={state} size={size} theme="auto" aria-label={label} />
      {size === 64 && (
        <span className="text-[13px] leading-none text-muted-foreground">{label}</span>
      )}
    </div>
  );
}
