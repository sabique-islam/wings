import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  parseWeekRangeLabel,
  plannerDayName,
  weekContainsDate,
} from "@/lib/weeklyPlanner";

export const plannerTodayKey = new PluginKey("plannerToday");

type WalkNode = {
  type: { name: string };
  textContent: string;
  nodeSize: number;
  descendants: (fn: (node: WalkNode, pos: number) => boolean | void) => void;
};

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function sundayInsideWeekCard(card: WalkNode): Date | null {
  let sunday: Date | null = null;
  card.descendants((child) => {
    if (sunday || child.type.name !== "paragraph") return;
    sunday = parseWeekRangeLabel(child.textContent);
  });
  return sunday;
}

/** Node decorations for today's day heading inside the current week card. */
export function plannerTodayDecorations(doc: WalkNode, now = new Date()): DecorationSet {
  const dayName = plannerDayName(now);
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "weekCard") return;
    const sunday = sundayInsideWeekCard(node);
    if (!sunday || !weekContainsDate(sunday, now)) return false;
    node.descendants((child, innerPos) => {
      if (child.type.name !== "heading") return;
      if (child.textContent.trim() !== dayName) return;
      const from = pos + 1 + innerPos;
      decos.push(Decoration.node(from, from + child.nodeSize, { class: "nw-planner-today" }));
    });
    return false;
  });
  return DecorationSet.create(doc as never, decos);
}

export function plannerTodayPlugin() {
  return new Plugin({
    key: plannerTodayKey,
    state: {
      init: (_, state) => plannerTodayDecorations(state.doc as never),
      apply(tr, decos, _old, next) {
        if (!tr.docChanged && !tr.getMeta(plannerTodayKey)) return decos;
        return plannerTodayDecorations(next.doc as never);
      },
    },
    props: {
      decorations: (state) => plannerTodayKey.getState(state) as never,
    },
    view(view) {
      let day = localDayKey(new Date());
      const timer = window.setInterval(() => {
        const next = localDayKey(new Date());
        if (next === day) return;
        day = next;
        view.dispatch(view.state.tr.setMeta(plannerTodayKey, next));
      }, 60_000);
      return { destroy: () => window.clearInterval(timer) };
    },
  });
}
