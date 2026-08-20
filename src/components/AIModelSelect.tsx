import type { ComponentType } from "react";
import { Code2, Cpu, Eye, Image, type IconProps } from "@/lib/icons";
import type { ProviderModel } from "@/lib/ai/types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function modelBadgeIcon(model: ProviderModel): ComponentType<IconProps> | null {
  if (model.kind === "coding") return Code2;
  if (model.kind === "system") return Cpu;
  if (model.kind === "image" || model.image) return Image;
  if (model.vision) return Eye;
  return null;
}

function ModelLabel({ model }: { model: ProviderModel }) {
  const Badge = modelBadgeIcon(model);
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="truncate">{model.label}</span>
      {Badge && <Badge className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </span>
  );
}

function groupModels(models: ProviderModel[]) {
  const current = models.filter((m) => (m.group ?? "current") === "current");
  const dedicated = models.filter((m) => m.group === "dedicated");
  return { current, dedicated };
}

interface Props {
  models: ProviderModel[];
  value: string;
  onChange: (id: string) => void;
  triggerClassName?: string;
}

export function AIModelSelect({ models, value, onChange, triggerClassName }: Props) {
  const { current, dedicated } = groupModels(models);
  const known = models.some((m) => m.id === value);
  const resolved = known ? value : models[0]?.id || "";

  return (
    <Select value={resolved} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 text-xs", triggerClassName)}>
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        {current.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-normal pl-2">
              Current
            </SelectLabel>
            {current.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                <ModelLabel model={m} />
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {dedicated.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-normal pl-2">
              Dedicated
            </SelectLabel>
            {dedicated.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                <ModelLabel model={m} />
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
