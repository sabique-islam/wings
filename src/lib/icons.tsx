"use client";

import { forwardRef, type ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import * as Animated from "@animateicons/react/lucide";
import { AlertCircle, CheckSquare, Circle, CircleHelp, Columns, Columns3, Cookie, Dot, Eraser, FileJson, FolderDown, FolderUp, GripVertical, Hash, ImagePlus, Languages, Loader2, Maximize2, Palette, PanelLeft, RotateCcw, Rows3, Scissors, Sigma, Square, Table, Table2, Wand2 } from "lucide-react";

function iconSize(className?: string, size?: LucideProps["size"]) {
  if (typeof size === "number") return size;
  const match = className?.match(/\b(?:h|w)-(\d+(?:\.\d+)?)\b/);
  if (match) return Math.round(Number(match[1]) * 4);
  return 16;
}

function wrapIcon(Icon: ComponentType<any>): ComponentType<LucideProps> {
  const Wrapped = forwardRef<HTMLDivElement, LucideProps>((props, ref) => {
    const { className, size, color, ...rest } = props;
    return (
      <Icon
        ref={ref}
        className={className}
        size={iconSize(className, size)}
        color={color ?? "currentColor"}
        {...rest}
      />
    );
  });
  Wrapped.displayName = "AnimatedIcon";
  return Wrapped as ComponentType<LucideProps>;
}

export const AlignCenter = wrapIcon(Animated.AlignCenter);
export const AlignLeft = wrapIcon(Animated.AlignLeft);
export const AlignRight = wrapIcon(Animated.AlignRight);
export const ArrowLeft = wrapIcon(Animated.ArrowLeft);
export const ArrowRight = wrapIcon(Animated.ArrowRight);
export const ArrowUpLeft = wrapIcon(Animated.ArrowUpLeft);
export const Bell = wrapIcon(Animated.Bell);
export const Bold = wrapIcon(Animated.Bold);
export const BookOpen = wrapIcon(Animated.BookOpen);
export const Calculator = wrapIcon(Animated.Calculator);
export const Calendar = wrapIcon(Animated.Calendar);
export const Check = wrapIcon(Animated.Check);
export const ChevronDown = wrapIcon(Animated.ChevronDown);
export const ChevronLeft = wrapIcon(Animated.ChevronLeft);
export const ChevronRight = wrapIcon(Animated.ChevronRight);
export const ChevronUp = wrapIcon(Animated.ChevronUp);
export const Cloud = wrapIcon(Animated.Cloud);
export const CloudOff = wrapIcon(Animated.CloudOff);
export const Code = wrapIcon(Animated.Code);
export const Copy = wrapIcon(Animated.Copy);
export const CreditCard = wrapIcon(Animated.CreditCard);
export const Download = wrapIcon(Animated.Download);
export const ExternalLink = wrapIcon(Animated.ExternalLink);
export const Eye = wrapIcon(Animated.Eye);
export const EyeOff = wrapIcon(Animated.EyeOff);
export const FilePlus = wrapIcon(Animated.FilePlus);
export const FileText = wrapIcon(Animated.FileText);
export const FolderOpen = wrapIcon(Animated.FolderOpen);
export const Github = wrapIcon(Animated.Github);
export const Globe = wrapIcon(Animated.Globe);
export const HardDrive = wrapIcon(Animated.HardDrive);
export const Heading1 = wrapIcon(Animated.Heading1);
export const Heading2 = wrapIcon(Animated.Heading2);
export const History = wrapIcon(Animated.History);
export const Image = wrapIcon(Animated.Image);
export const Italic = wrapIcon(Animated.Italic);
export const Keyboard = wrapIcon(Animated.Keyboard);
export const LayoutGrid = wrapIcon(Animated.LayoutGrid);
export const Link = wrapIcon(Animated.Link);
export const List = wrapIcon(Animated.List);
export const ListChecks = wrapIcon(Animated.ListChecks);
export const ListOrdered = wrapIcon(Animated.ListOrdered);
export const Lock = wrapIcon(Animated.Lock);
export const Mail = wrapIcon(Animated.Mail);
export const Menu = wrapIcon(Animated.Menu);
export const MessageCircle = wrapIcon(Animated.MessageCircle);
export const Minus = wrapIcon(Animated.Minus);
export const Monitor = wrapIcon(Animated.Monitor);
export const Moon = wrapIcon(Animated.Moon);
export const Pencil = wrapIcon(Animated.Pencil);
export const Pin = wrapIcon(Animated.Pin);
export const PinOff = wrapIcon(Animated.PinOff);
export const Plug = wrapIcon(Animated.Plug);
export const Plus = wrapIcon(Animated.Plus);
export const Quote = wrapIcon(Animated.Quote);
export const RefreshCw = wrapIcon(Animated.RefreshCw);
export const Save = wrapIcon(Animated.Save);
export const Search = wrapIcon(Animated.Search);
export const Send = wrapIcon(Animated.Send);
export const Settings = wrapIcon(Animated.Settings);
export const Sparkles = wrapIcon(Animated.Sparkles);
export const Star = wrapIcon(Animated.Star);
export const Strikethrough = wrapIcon(Animated.Strikethrough);
export const Sun = wrapIcon(Animated.Sun);
export const Trash2 = wrapIcon(Animated.Trash2);
export const Type = wrapIcon(Animated.Type);
export const Underline = wrapIcon(Animated.Underline);
export const Upload = wrapIcon(Animated.Upload);
export const User = wrapIcon(Animated.User);
export const X = wrapIcon(Animated.X);
export const AlertTriangle = wrapIcon(Animated.TriangleAlert);
export const Code2 = wrapIcon(Animated.CodeXml);
export const FileDown = wrapIcon(Animated.Download);
export const FilePlus2 = wrapIcon(Animated.FilePlus);
export const Heading3 = wrapIcon(Animated.Heading);
export const ImageIcon = wrapIcon(Animated.Image);
export const Layout = wrapIcon(Animated.LayoutDashboard);
export const Link2Off = wrapIcon(Animated.Unlink);
export const LinkIcon = wrapIcon(Animated.Link);
export const MoreHorizontal = wrapIcon(Animated.Ellipsis);
export const PenLine = wrapIcon(Animated.Pencil);
export const PenTool = wrapIcon(Animated.Compass);
export const Share2 = wrapIcon(Animated.Share);
export const Unplug = wrapIcon(Animated.PlugZap);
export { AlertCircle };
export { CheckSquare };
export { Circle };
export { CircleHelp };
export { Columns };
export { Columns3 };
export { Cookie };
export { Dot };
export { Eraser };
export { FileJson };
export { FolderDown };
export { FolderUp };
export { GripVertical };
export { Hash };
export { ImagePlus };
export { Languages };
export { Loader2 };
export { Maximize2 };
export { Palette };
export { PanelLeft };
export { RotateCcw };
export { Rows3 };
export { Scissors };
export { Sigma };
export { Square };
export { Table };
export { Table2 };
export { Wand2 };

export type { LucideProps } from "@/lib/icons";
