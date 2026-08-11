import { useEffect, useState } from "react";
import { Plus, ArrowRight, ChevronRight } from "@/lib/icons";
import type { Entry } from "@/lib/journal";
import {
  activityTrend,
  buildActiveDates,
  buildActivitySeries,
  buildWeekSeries,
  computeDashboardStats,
} from "@/lib/dashboardStats";
import { toBlocks } from "@/lib/ascii/art";
import { useAuth } from "@/hooks/useAuth";
import { getMyProfile, resolveGreetingName, type UserProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { DashboardActivityLine } from "@/components/dashboard/DashboardActivityLine";
import { DashboardWeekBars } from "@/components/dashboard/DashboardWeekBars";
import { DashboardCalendar } from "@/components/dashboard/DashboardCalendar";
import { DashboardRhythm } from "@/components/dashboard/DashboardRhythm";
import {
  DashboardPanel,
  DashboardSectionLabel,
  DashboardSharpButton,
} from "@/components/dashboard/DashboardPanel";

interface Props {
  entries: Entry[];
  roleMap: Record<string, string>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenAI: () => void;
}

function formatWords(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("default", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DashboardHome({ entries, roleMap, onSelect, onNew, onOpenAI }: Props) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const stats = computeDashboardStats(entries, roleMap as Record<string, "owner" | "admin" | "editor" | "viewer">);
  const fillPct = Math.min(1, stats.pageCount / 50);
  const name = resolveGreetingName(profile, user?.email);

  const activitySeries = buildActivitySeries(stats.dailyActivity);
  const weekSeries = buildWeekSeries(stats.weekActivity);
  const activeDates = buildActiveDates(entries);
  const trend = activityTrend(stats.dailyActivity);
  const activeDays = stats.weekActivity.filter((n) => n > 0).length;
  const rhythm = toBlocks(stats.dailyActivity);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    const load = () => {
      getMyProfile(user.id).then((p) => {
        if (!cancelled) setProfile(p);
      });
    };

    load();
    const onProfile = () => load();
    window.addEventListener("nw:profile", onProfile);
    return () => {
      cancelled = true;
      window.removeEventListener("nw:profile", onProfile);
    };
  }, [user?.id]);

  const metrics = [
    { label: "Pages", value: String(stats.pageCount), sub: "workspace" },
    { label: "Words", value: formatWords(stats.totalWords), sub: "written" },
    { label: "Pinned", value: String(stats.pinnedCount), sub: "saved" },
    { label: "Shared", value: String(stats.sharedCount), sub: "with you" },
  ];

  return (
    <div className="nw-dashboard-home min-h-full w-full">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 md:py-12 space-y-5 md:space-y-6">
        <DashboardPanel variant="star" hover={false} className="md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-4 min-w-0">
              <DashboardSectionLabel>Overview</DashboardSectionLabel>
              <h1 className="font-display font-bold text-3xl md:text-[2.25rem] text-ink-0 tracking-[-0.03em] leading-[1.05]">
                Welcome back,{" "}
                <span className="text-accent-strong">{name}</span>
              </h1>
              <p className="text-sm text-ink-2 font-sans max-w-md leading-relaxed">
                Your workspace at a glance. Pick up where you left off or start fresh.
              </p>
              <p className="font-mono text-[10px] text-ink-3 tracking-wider">
                rhythm {rhythm}
                <span className="mx-2 text-ink-3/40">·</span>
                {activeDays}/7 active this week
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <DashboardSharpButton primary onClick={onNew}>
                <Plus className="h-3.5 w-3.5" />
                New page
              </DashboardSharpButton>
              <DashboardSharpButton onClick={onOpenAI}>
                Ask AI
                <ArrowRight className="h-3 w-3" />
              </DashboardSharpButton>
            </div>
          </div>
        </DashboardPanel>

        <div className="nw-dash-kpi-strip">
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={cn(
                "nw-dash-kpi-cell",
                i > 0 && "border-l border-dashed border-ink-2/35",
              )}
            >
              <DashboardSectionLabel>{m.label}</DashboardSectionLabel>
              <p className="font-display font-bold text-2xl md:text-3xl text-ink-0 tabular-nums mt-2 tracking-tight">
                {m.value}
              </p>
              <p className="text-[10px] text-ink-3 font-mono mt-1 tracking-wide">{m.sub}</p>
            </div>
          ))}
        </div>

        <div className="nw-dash-bento">
          <DashboardActivityLine
            series={activitySeries}
            trend={trend}
            className="nw-dash-bento__activity"
          />
          <DashboardWeekBars series={weekSeries} className="nw-dash-bento__week" />
          <DashboardCalendar activeDates={activeDates} className="nw-dash-bento__cal" />
          <DashboardPanel hover={false} className="nw-dash-bento__recent">
            <div className="flex items-center justify-between gap-3 mb-5">
              <DashboardSectionLabel>Recent pages</DashboardSectionLabel>
              <span className="text-[10px] text-ink-3 font-mono tabular-nums">{stats.recent.length}</span>
            </div>
            {stats.recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center border border-dashed border-ink-2/30">
                <p className="text-sm text-ink-2 font-sans">No pages yet</p>
                <p className="text-[10px] text-ink-3 font-mono tracking-wider">⌘N to create</p>
              </div>
            ) : (
              <ul className="divide-y divide-dashed divide-ink-2/30">
                {stats.recent.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(p.id)}
                      className="nw-dash-recent-row w-full"
                    >
                      <span className="font-mono text-ink-3 text-[10px] tabular-nums w-7 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 min-w-0 text-left">
                        <span className="nw-dash-recent-title block text-sm text-ink-0 truncate font-sans">
                          {p.title}
                        </span>
                        <span className="block text-[10px] text-ink-3 mt-0.5 font-mono sm:hidden">
                          {formatDate(p.date)} · {p.words}w
                        </span>
                      </span>
                      <span className="hidden sm:block text-[10px] text-ink-3 font-mono shrink-0">
                        {formatDate(p.date)}
                      </span>
                      <span className="font-mono text-[10px] text-ink-2 tabular-nums w-10 text-right shrink-0">
                        {p.words}w
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-3 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashboardPanel>
          <DashboardRhythm
            activeDays={activeDays}
            pinnedCount={stats.pinnedCount}
            pageCount={stats.pageCount}
            capacityPct={fillPct}
            className="nw-dash-bento__rhythm"
          />
        </div>
      </div>
    </div>
  );
}
