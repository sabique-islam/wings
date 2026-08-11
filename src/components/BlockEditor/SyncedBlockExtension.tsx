import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { RefreshCw } from "@/lib/icons";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    syncedBlock: {
      insertSyncedBlock: () => ReturnType;
    };
  }
}

const syncedBlockKey = new PluginKey("syncedBlockMirror");

function newSyncId(): string {
  return `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const SyncedBlock = Node.create({
  name: "syncedBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      syncId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-sync-id") || "",
        renderHTML: (attrs) => (attrs.syncId ? { "data-sync-id": attrs.syncId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="synced-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "synced-block", class: "synced-block" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(({ node }) => {
      const syncId = (node.attrs.syncId as string) || "";
      return (
        <NodeViewWrapper
          className="synced-block rounded-md border border-dashed border-border-subtle bg-muted/20"
          data-type="synced-block"
          data-sync-id={syncId}
        >
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-mono border-b border-border-subtle/60"
            contentEditable={false}
          >
            <RefreshCw className="h-3 w-3" />
            Synced
          </div>
          <div className="synced-block-content px-2 py-1">
            <NodeViewContent />
          </div>
        </NodeViewWrapper>
      );
    });
  },

  addCommands() {
    return {
      insertSyncedBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { syncId: newSyncId() },
            content: [{ type: "paragraph" }],
          }),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: syncedBlockKey,
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.some((tr) => tr.getMeta(syncedBlockKey)?.mirroring)) return null;
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const groups = new Map<string, Array<{ pos: number; nodeSize: number }>>();
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "syncedBlock") return;
            const syncId = node.attrs.syncId as string;
            if (!syncId) return;
            const list = groups.get(syncId) ?? [];
            list.push({ pos, nodeSize: node.nodeSize });
            groups.set(syncId, list);
          });

          const selectionPos = newState.selection.from;
          let tr = newState.tr;
          let changed = false;

          for (const instances of groups.values()) {
            if (instances.length < 2) continue;
            // Prefer the instance the cursor is in — that is the one the user
            // just typed into. Fall back to the first copy in document order.
            const source =
              instances.find((inst) => selectionPos > inst.pos && selectionPos < inst.pos + inst.nodeSize) ??
              instances[0];
            const sourceNode = newState.doc.nodeAt(source.pos);
            if (!sourceNode) continue;

            for (const target of instances) {
              if (target.pos === source.pos) continue;
              const targetNode = tr.doc.nodeAt(tr.mapping.map(target.pos));
              if (!targetNode) continue;
              if (targetNode.content.eq(sourceNode.content)) continue;
              const mappedPos = tr.mapping.map(target.pos);
              const from = mappedPos + 1;
              const to = mappedPos + targetNode.nodeSize - 1;
              tr = tr.replaceWith(from, to, sourceNode.content);
              changed = true;
            }
          }

          return changed ? tr.setMeta(syncedBlockKey, { mirroring: true }) : null;
        },
      }),
    ];
  },
});
