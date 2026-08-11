import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { Copy, Check } from "@/lib/icons";
import {
  codeBlockLowlight,
  formatCodeLanguageLabel,
  getCodeBlockLanguageOptions,
} from "./codeLanguages";

function CodeBlockView({ node, updateAttributes, extension }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const lang = node.attrs.language || "plaintext";
  const languages = getCodeBlockLanguageOptions(lang);

  const copy = async () => {
    const text = node.textContent;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <NodeViewWrapper className="code-block-wrapper" data-language={lang}>
      <div className="code-block-toolbar" contentEditable={false}>
        <select
          value={lang}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          className="code-lang-select"
        >
          {languages.map((l) => (
            <option key={l} value={l}>{formatCodeLanguageLabel(l)}</option>
          ))}
        </select>
        <button type="button" onClick={copy} className="code-copy-btn" title="Copy code">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className={`language-${lang}`}>
        <NodeViewContent as="div" className="code-block-content" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockExtension = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  lowlight: codeBlockLowlight,
  defaultLanguage: "plaintext",
  HTMLAttributes: { class: "code-block" },
});
