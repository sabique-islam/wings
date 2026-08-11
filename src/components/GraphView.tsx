import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Share2, X } from "@/lib/icons";
import { getEntryTitle, type Entry } from "@/lib/journal";
import {
  getAllTags,
  getLinkEdges,
  getLinkIndexVersion,
  getTagsByEntryId,
  subscribeLinkIndex,
} from "@/lib/linkIndex";
import {
  applyGraphFilters,
  applySavedPositions,
  buildGraph,
  buildLocalGraph,
  graphBounds,
  nodeRadius,
  positionsToRecord,
  stepLayout,
  type Graph,
  type GraphFilters,
  type GraphNode,
} from "@/lib/graphLayout";
import {
  defaultGraphState,
  flushGraphStateSave,
  loadGraphState,
  scheduleGraphStateSave,
  type GraphStateRow,
} from "@/lib/graphState";
import { fitViewport, useGraphViewport, type Viewport } from "./useGraphViewport";

const FULL_SETTLE_TICKS = 420;
const RESTORE_SETTLE_TICKS = 60;
const POSITION_RESTORE_RATIO = 0.7;
const PADDING = 48;

interface Props {
  entries: Entry[];
  activeId: string | null;
  userId: string | null;
  onNavigate: (id: string) => void;
}

function fitGraphViewport(graph: Graph, width: number, height: number): Viewport {
  const { minX, minY, maxX, maxY } = graphBounds(graph.nodes);
  return fitViewport(minX, minY, maxX, maxY, width, height, PADDING);
}

/**
 * Workspace link graph with local/global modes, filters, pan/zoom, and persisted layout.
 */
export function GraphView({ entries, activeId, userId, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [graphState, setGraphState] = useState<GraphStateRow | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
  const graphStateRef = useRef<GraphStateRow | null>(null);
  const dragMovedRef = useRef(false);

  const linkIndexVersion = useSyncExternalStore(
    subscribeLinkIndex,
    getLinkIndexVersion,
    getLinkIndexVersion,
  );

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("nw:graph", toggle);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("nw:graph", toggle);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    void loadGraphState(userId).then((state) => {
      if (!cancelled) {
        setGraphState(state);
        graphStateRef.current = state;
        if (state.viewport) viewportRef.current = state.viewport;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    return () => {
      const state = graphStateRef.current;
      if (state) flushGraphStateSave(state);
    };
  }, [open]);

  const updateGraphState = useCallback(
    (patch: Partial<GraphStateRow>) => {
      setGraphState((prev) => {
        const base = prev ?? defaultGraphState(userId ?? "local");
        const next = { ...base, ...patch };
        graphStateRef.current = next;
        if (userId) scheduleGraphStateSave(next);
        return next;
      });
    },
    [userId],
  );

  const mode = graphState?.mode ?? "global";
  const depth = graphState?.depth ?? 2;
  const filters: GraphFilters = graphState?.filters ?? {
    hideUnlinked: false,
    orphansOnly: false,
    tag: null,
  };

  const graph = useMemo(() => {
    if (!open) return null;
    const pages = entries.map((e) => ({
      id: e.id,
      label: getEntryTitle(e),
      parentId: e.parent_id,
    }));
    const known = new Set(entries.map((e) => e.id));
    const links = getLinkEdges(known);

    let built =
      mode === "local" && activeId
        ? buildLocalGraph(pages, links, activeId, depth)
        : buildGraph(pages, links);

    built = applyGraphFilters(built, pages, filters, getTagsByEntryId(), links);

    if (graphState?.positions) {
      applySavedPositions(built.nodes, graphState.positions);
    }
    return built;
  }, [open, entries, mode, activeId, depth, filters, graphState?.positions, linkIndexVersion]);

  const allTags = useMemo(() => (open ? getAllTags() : []), [open, linkIndexVersion]);

  const persistLayout = useCallback(
    (nodes: GraphNode[], viewport: Viewport) => {
      if (!userId) return;
      updateGraphState({
        positions: positionsToRecord(nodes),
        viewport,
      });
    },
    [userId, updateGraphState],
  );

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      dragMovedRef.current = true;
      updateGraphState({ viewport });
    },
    [updateGraphState],
  );

  useGraphViewport({
    enabled: open,
    canvasRef,
    viewportRef,
    onViewportChange,
  });

  const nodeAt = useCallback(
    (clientX: number, clientY: number): GraphNode | null => {
      const canvas = canvasRef.current;
      if (!canvas || !graph) return null;
      const rect = canvas.getBoundingClientRect();
      const { scale, offsetX, offsetY } = viewportRef.current;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      for (const node of graph.nodes) {
        const dx = x - (node.x * scale + offsetX);
        const dy = y - (node.y * scale + offsetY);
        if (Math.hypot(dx, dy) <= nodeRadius(node) + 6) return node;
      }
      return null;
    },
    [graph],
  );

  useEffect(() => {
    if (!open || !graph) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);

    const styles = getComputedStyle(document.documentElement);
    const foreground = `hsl(${styles.getPropertyValue("--foreground").trim()})`;
    const muted = `hsl(${styles.getPropertyValue("--muted-foreground").trim()})`;
    const accent = `hsl(${styles.getPropertyValue("--primary").trim() || styles.getPropertyValue("--foreground").trim()})`;

    const savedCount = graphState?.positions
      ? applySavedPositions(graph.nodes, graphState.positions)
      : 0;
    const restoreRatio = graph.nodes.length > 0 ? savedCount / graph.nodes.length : 0;
    const maxTicks =
      restoreRatio >= POSITION_RESTORE_RATIO ? RESTORE_SETTLE_TICKS : FULL_SETTLE_TICKS;
    const hasSavedViewport = graphState?.viewport != null;

    if (!hasSavedViewport) {
      viewportRef.current = fitGraphViewport(graph, width, height);
    }

    let tick = 0;
    let frame = 0;

    const draw = () => {
      const { scale, offsetX, offsetY } = viewportRef.current;
      const project = (node: GraphNode) => ({
        x: node.x * scale + offsetX,
        y: node.y * scale + offsetY,
      });

      context.clearRect(0, 0, width, height);
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));

      for (const edge of graph.edges) {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) continue;
        const a = project(from);
        const b = project(to);
        context.strokeStyle = muted;
        context.globalAlpha = edge.kind === "child" ? 0.18 : 0.3;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }

      context.globalAlpha = 1;
      for (const node of graph.nodes) {
        const { x, y } = project(node);
        const radius = nodeRadius(node);
        const isActive = node.id === activeId;
        context.fillStyle = isActive ? accent : foreground;
        context.globalAlpha = isActive ? 1 : 0.55;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();

        if (isActive || node.degree >= 2 || graph.nodes.length <= 40) {
          context.globalAlpha = isActive ? 0.9 : 0.5;
          context.fillStyle = foreground;
          context.font = "10px ui-sans-serif, system-ui, sans-serif";
          context.textAlign = "center";
          context.fillText(node.label.slice(0, 24), x, y + radius + 11);
        }
      }
      context.globalAlpha = 1;
    };

    const loop = () => {
      stepLayout(graph);
      if (!hasSavedViewport && (tick % 12 === 0 || tick < 30)) {
        viewportRef.current = fitGraphViewport(graph, width, height);
      }
      draw();
      tick += 1;
      if (tick < maxTicks) {
        frame = requestAnimationFrame(loop);
      } else {
        persistLayout(graph.nodes, viewportRef.current);
      }
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [open, graph, activeId, graphState?.positions, graphState?.viewport, persistLayout]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  const resetView = () => {
    if (!graph || !canvasRef.current) return;
    viewportRef.current = fitGraphViewport(graph, canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    updateGraphState({ viewport: viewportRef.current, positions: {} });
  };

  if (!open) return null;

  const localDisabled = activeId == null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-background/80" onClick={() => setOpen(false)} />
      <div className="relative bg-card border border-border rounded-lg shadow-2xl w-[min(90vw,960px)] h-[min(85vh,720px)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-foreground font-mono">
            <Share2 className="h-3.5 w-3.5" />
            <span>graph · {graph?.nodes.length ?? 0} pages · {graph?.edges.length ?? 0} links</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
            <div className="inline-flex rounded border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => updateGraphState({ mode: "global", filters: { ...filters, orphansOnly: false } })}
                className={`px-2 py-1 ${mode === "global" ? "bg-accent-soft text-accent-strong" : "text-muted-foreground hover:text-foreground"}`}
              >
                global
              </button>
              <button
                type="button"
                disabled={localDisabled}
                title={localDisabled ? "Open a page to use local graph" : undefined}
                onClick={() => updateGraphState({ mode: "local" })}
                className={`px-2 py-1 disabled:opacity-40 ${mode === "local" ? "bg-accent-soft text-accent-strong" : "text-muted-foreground hover:text-foreground"}`}
              >
                local
              </button>
            </div>
            {mode === "local" && (
              <select
                value={depth}
                onChange={(e) => updateGraphState({ depth: Number(e.target.value) as 1 | 2 | 3 })}
                className="rounded border border-border bg-background px-2 py-1 text-muted-foreground"
              >
                <option value={1}>depth 1</option>
                <option value={2}>depth 2</option>
                <option value={3}>depth 3</option>
              </select>
            )}
            <label className="inline-flex items-center gap-1 text-muted-foreground">
              <input
                type="checkbox"
                checked={filters.hideUnlinked}
                onChange={(e) => updateGraphState({ filters: { ...filters, hideUnlinked: e.target.checked } })}
              />
              hide unlinked
            </label>
            <label
              className={`inline-flex items-center gap-1 text-muted-foreground ${mode === "local" ? "opacity-40" : ""}`}
              title={mode === "local" ? "Orphans filter applies in global mode only" : undefined}
            >
              <input
                type="checkbox"
                disabled={mode === "local"}
                checked={filters.orphansOnly}
                onChange={(e) => updateGraphState({ filters: { ...filters, orphansOnly: e.target.checked } })}
              />
              orphans
            </label>
            <select
              value={filters.tag ?? ""}
              onChange={(e) =>
                updateGraphState({
                  filters: { ...filters, tag: e.target.value || null },
                })
              }
              className="rounded border border-border bg-background px-2 py-1 text-muted-foreground max-w-[120px]"
            >
              <option value="">all tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetView}
              className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
            >
              reset view
            </button>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors ml-auto"
            aria-label="Close graph"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 relative min-h-0">
          <canvas
            ref={canvasRef}
            className={`w-full h-full touch-none ${hovered ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
            onMouseMove={(e) => setHovered(nodeAt(e.clientX, e.clientY))}
            onMouseLeave={() => setHovered(null)}
            onClick={(e) => {
              if (dragMovedRef.current) {
                dragMovedRef.current = false;
                return;
              }
              const node = nodeAt(e.clientX, e.clientY);
              if (!node) return;
              setOpen(false);
              onNavigate(node.id);
            }}
          />
          {hovered && (
            <div className="absolute bottom-3 left-3 text-[11px] text-muted-foreground bg-card/90 border border-border-subtle rounded px-2 py-1 pointer-events-none">
              {hovered.label} · {hovered.degree} connection{hovered.degree === 1 ? "" : "s"}
            </div>
          )}
          {graph?.nodes.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              No pages match these filters.
            </p>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground/40 font-mono shrink-0">
          ⌘⇧G to toggle · scroll to zoom · drag to pan · click a node to open
        </div>
      </div>
    </div>
  );
}
