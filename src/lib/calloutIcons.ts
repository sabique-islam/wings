import type { ComponentType } from "react";
import {
  AlertTriangle,
  CircleCheck,
  FileText,
  Flag,
  Flame,
  Lightbulb,
  MessageCircle,
  Pin,
  Star,
  X,
  type IconProps,
} from "@/lib/icons";

export const CALLOUT_ICON_OPTIONS: {
  emoji: string;
  label: string;
  icon: ComponentType<IconProps>;
}[] = [
  { emoji: "💡", label: "Idea", icon: Lightbulb },
  { emoji: "⚠️", label: "Warning", icon: AlertTriangle },
  { emoji: "✅", label: "Done", icon: CircleCheck },
  { emoji: "❌", label: "Blocked", icon: X },
  { emoji: "📌", label: "Pin", icon: Pin },
  { emoji: "🔥", label: "Important", icon: Flame },
  { emoji: "💬", label: "Note", icon: MessageCircle },
  { emoji: "📝", label: "Write", icon: FileText },
  { emoji: "🎯", label: "Goal", icon: Flag },
  { emoji: "⭐", label: "Star", icon: Star },
];

export function calloutIconFor(emoji: string): ComponentType<IconProps> {
  return CALLOUT_ICON_OPTIONS.find((opt) => opt.emoji === emoji)?.icon ?? Lightbulb;
}
