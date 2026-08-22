import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { Check, ChevronDown, ChevronsDownUp, Copy, WrapText } from "@/lib/icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CodeBlockMermaidPreview } from "./CodeBlockMermaidPreview";
import {
  codeBlockLowlight,
  filterCodeLanguages,
  formatCodeLanguageLabel,
  isMermaidLanguage,
} from "./codeLanguages";

function readFlag(element: HTMLElement, name: string): boolean {
  return element.getAttribute(name) === "true";
}

function CodeLanguagePicker({
  language,
  disabled,
  onChange,
}: {
  language: string;
  disabled: boolean;
  onChange: (language: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = filterCodeLanguages(query, language);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="code-lang-trigger"
          data-testid="code-lang-trigger"
          disabled={disabled}
          aria-label="Code language"
        >
          {formatCodeLanguageLabel(language)}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            data-testid="code-lang-search"
            placeholder="Search language…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No language</CommandEmpty>
            <CommandGroup>
              {matches.map((id) => (
                <CommandItem
                  key={id}
                  value={id}
                  data-testid={`code-lang-option-${id}`}
                  onSelect={() => {
                    onChange(id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {formatCodeLanguageLabel(id)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const lang = (node.attrs.language as string) || "plaintext";
  const wrap = node.attrs.wrap === true;
  const collapsed = node.attrs.collapsed === true;
  const editable = editor.isEditable;
  const source = node.textContent;

  const copy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <NodeViewWrapper
      className="code-block-wrapper"
      data-language={lang}
      data-wrap={wrap ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="code-block-toolbar" contentEditable={false}>
        <CodeLanguagePicker
          language={lang}
          disabled={!editable}
          onChange={(language) => updateAttributes({ language })}
        />
        <div className="code-block-toolbar-actions">
          <button
            type="button"
            className="code-toolbar-btn"
            data-testid="code-wrap"
            aria-pressed={wrap}
            aria-label={wrap ? "Unwrap lines" : "Wrap lines"}
            disabled={!editable}
            title={wrap ? "Unwrap lines" : "Wrap lines"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => updateAttributes({ wrap: !wrap })}
          >
            <WrapText className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="code-toolbar-btn"
            data-testid="code-collapse"
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand code" : "Collapse code"}
            disabled={!editable}
            title={collapsed ? "Expand code" : "Collapse code"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => updateAttributes({ collapsed: !collapsed })}
          >
            <ChevronsDownUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="code-copy-btn"
            data-testid="code-copy"
            title="Copy code"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void copy()}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
      <pre className={`language-${lang}`}>
        <NodeViewContent as="div" className="code-block-content" />
      </pre>
      {isMermaidLanguage(lang) ? <CodeBlockMermaidPreview source={source} /> : null}
    </NodeViewWrapper>
  );
}

export const CodeBlockExtension = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      wrap: {
        default: false,
        parseHTML: (element) => readFlag(element, "data-wrap"),
        renderHTML: (attributes) => (attributes.wrap ? { "data-wrap": "true" } : {}),
      },
      collapsed: {
        default: false,
        parseHTML: (element) => readFlag(element, "data-collapsed"),
        renderHTML: (attributes) => (attributes.collapsed ? { "data-collapsed": "true" } : {}),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  lowlight: codeBlockLowlight,
  defaultLanguage: "plaintext",
  HTMLAttributes: { class: "code-block" },
});
