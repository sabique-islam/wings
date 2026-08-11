import { Entry } from "@/lib/journal";
import { ChevronRight } from "@/lib/icons";

interface Props {
  trail: Entry[];
  onNavigate: (id: string | null) => void;
}

function getTitle(entry: Entry): string {
  return entry.title || entry.content.split("\n")[0].replace(/^#+\s*/, "").slice(0, 30) || "Untitled";
}

export function Breadcrumbs({ trail, onNavigate }: Props) {
  if (trail.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono overflow-x-auto">
      {trail.map((entry, i) => (
        <span key={entry.id} className="flex items-center gap-1 shrink-0">
          {i > 0 && <ChevronRight className="h-2.5 w-2.5" />}
          {i < trail.length - 1 ? (
            <button
              onClick={() => onNavigate(entry.id)}
              className="hover:text-foreground transition-colors truncate max-w-[120px]"
            >
              {getTitle(entry)}
            </button>
          ) : (
            <span className="text-muted-foreground truncate max-w-[120px]">{getTitle(entry)}</span>
          )}
        </span>
      ))}
    </div>
  );
}
