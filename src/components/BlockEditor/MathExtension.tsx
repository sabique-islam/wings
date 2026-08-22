import { Node, mergeAttributes, nodeInputRule, nodePasteRule } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useState, useRef, useEffect } from "react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      setBlockMath: (latex?: string) => ReturnType;
      setInlineMath: (latex?: string) => ReturnType;
    };
  }
}

function MathView({ node, updateAttributes, editor, inline }: any) {
  const [editing, setEditing] = useState(!node.attrs.latex);
  const [value, setValue] = useState(node.attrs.latex || "");
  const ref = useRef<HTMLSpanElement | HTMLDivElement>(null);

  useEffect(() => {
    if (!editing && ref.current) {
      try {
        katex.render(node.attrs.latex || "", ref.current as HTMLElement, {
          throwOnError: false,
          displayMode: !inline,
          strict: false,
          // trust:false blocks \href/\url/\includegraphics — prevents javascript:
          // URLs and raw HTML injection from stored latex on shared pages.
          trust: false,
          macros: {
            "\\R": "\\mathbb{R}",
            "\\N": "\\mathbb{N}",
            "\\Z": "\\mathbb{Z}",
            "\\Q": "\\mathbb{Q}",
            "\\C": "\\mathbb{C}",
          },
        });
      } catch {
        if (ref.current) ref.current.textContent = node.attrs.latex || "";
      }
    }
  }, [editing, node.attrs.latex, inline]);

  const commit = () => {
    updateAttributes({ latex: value });
    setEditing(false);
  };

  const Wrapper: any = inline ? "span" : "div";

  if (editing && editor.isEditable) {
    return (
      <NodeViewWrapper as={inline ? "span" : "div"} className={inline ? "math-inline-edit" : "math-block-edit"} data-type={inline ? "inline-math" : "block-math"}>
        {inline ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="E = mc^2"
            className="math-input"
          />
        ) : (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"
            className="math-input math-textarea"
            rows={Math.max(3, value.split("\n").length + 1)}
          />
        )}
        {!inline && (
          <div className="text-[10px] text-muted-foreground/60 mt-1">
            ⌘/Ctrl+Enter to save · Esc to cancel · Click to edit again
          </div>
        )}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as={inline ? "span" : "div"} className={inline ? "math-inline" : "math-block"} data-type={inline ? "inline-math" : "block-math"}>
      <Wrapper
        ref={ref as any}
        onClick={() => editor.isEditable && setEditing(true)}
        className={inline ? "math-render-inline" : "math-render-block"}
      />
    </NodeViewWrapper>
  );
}

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) =>
          el.getAttribute("data-latex") ||
          el.getAttribute("latex") ||
          (el.textContent || "").trim(),
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="block-math"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "block-math" }, HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props: any) => <MathView {...props} inline={false} />);
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("$$\n" + (node.attrs.latex || "") + "\n$$");
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
  addCommands() {
    return {
      setBlockMath:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    } as any;
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\$\$([^\n$]+?)\$\$$/,
        type: this.type,
        getAttributes: (m) => ({ latex: (m[1] || "").trim() }),
      }),
      nodeInputRule({
        find: /\\\[([^\n]+?)\\\]$/,
        type: this.type,
        getAttributes: (m) => ({ latex: (m[1] || "").trim() }),
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: /\$\$([\s\S]+?)\$\$/g,
        type: this.type,
        getAttributes: (m) => ({ latex: String(m[1] || "").trim() }),
      }),
      nodePasteRule({
        find: /\\\[([\s\S]+?)\\\]/g,
        type: this.type,
        getAttributes: (m) => ({ latex: String(m[1] || "").trim() }),
      }),
      nodePasteRule({
        find: /\\begin\{([a-zA-Z*]+)\}([\s\S]+?)\\end\{\1\}/g,
        type: this.type,
        getAttributes: (m) => ({
          latex: `\\begin{${m[1]}}${m[2]}\\end{${m[1]}}`,
        }),
      }),
    ];
  },
});

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) =>
          el.getAttribute("data-latex") ||
          el.getAttribute("latex") ||
          (el.textContent || "").trim(),
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-type": "inline-math" }, HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props: any) => <MathView {...props} inline={true} />);
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("$" + (node.attrs.latex || "") + "$");
        },
        parse: {},
      },
    };
  },
  addCommands() {
    return {
      setInlineMath:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    } as any;
  },
  addInputRules() {
    // Type $latex$ → render inline. Avoid $$ (handled by block) and $5 currency.
    return [
      nodeInputRule({
        find: /(?<![\\$])\$([^\n$]+?)\$$/,
        type: this.type,
        getAttributes: (m) => ({ latex: (m[1] || "").trim() }),
      }),
      nodeInputRule({
        find: /\\\(([^\n]+?)\\\)$/,
        type: this.type,
        getAttributes: (m) => ({ latex: (m[1] || "").trim() }),
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: /(?<![\\$])\$([^\n$]+?)\$(?!\d)/g,
        type: this.type,
        getAttributes: (m) => ({ latex: (m[1] || "").trim() }),
      }),
      nodePasteRule({
        find: /\\\(([^\n]+?)\\\)/g,
        type: this.type,
        getAttributes: (m) => ({ latex: (m[1] || "").trim() }),
      }),
    ];
  },
});
