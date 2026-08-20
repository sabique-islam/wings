import { useState, useEffect, useRef, useCallback, type ComponentType } from "react";
import {
  Sparkles, Send, X, Settings, Square,
  PenLine, FilePlus2, Wand2, Eye, EyeOff, Image as ImageIcon, ImagePlus,
  MessageCircle, ListChecks, BookOpen, type IconProps,
} from "@/lib/icons";
import { useResizable } from "@/hooks/useResizable";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { markdownToHtml } from "@/lib/markdown";
import { Entry, getEntryTitle, createEntry } from "@/lib/journal";
import { ChatMessage } from "@/lib/ai/types";
import { streamChat, generateImage } from "@/lib/ai/client";
import { PROVIDERS, getProvider } from "@/lib/ai/providers";
import { AIModelSelect } from "@/components/AIModelSelect";
import { AIModeSelect } from "@/components/AIModeSelect";
import { AIThinkingStatus } from "@/components/AIThinkingStatus";
import {
  getAssistantMode, setAssistantMode,
  systemPromptFor, placeholderFor, emptyStateBlurb,
  type AssistantMode,
} from "@/lib/ai/assistantMode";
import { finalizeAssistantOutput } from "@/lib/ai/toolBlocks";
import {
  getActiveProvider, setActiveProvider,
  getApiKeyFor, setApiKeyFor, clearApiKeyFor,
  getModelFor, setModelFor,
} from "@/lib/ai/storage";
import { collectDrawingsFromContent, snapshotsAsAttachments } from "@/lib/ai/excalidrawContext";
import { collectImagesFromContent, imagesAsAttachments, MAX_PAGE_IMAGES } from "@/lib/ai/pageImageContext";
import { filesToImageAttachments, isAllowedImageFile } from "@/lib/ai/imageAttachments";
import {
  buildPromptContext,
  mentionsVisual,
  NO_CONTEXT_SENT,
  type ActivePage,
  type SentContext,
} from "@/lib/ai/promptContext";
import { uploadImage } from "@/lib/imageUpload";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  activeEntry: Entry | null;
  allEntries: Entry[];
  onCreateEntry: (entry: Entry) => void;
  onNavigate: (id: string) => void;
}

interface UIMessage extends ChatMessage {
  id: string;
  pending?: boolean;
  actions?: { label: string; onClick: () => void }[];
  /** Object URLs for images the user attached — display only. */
  imagePreviews?: string[];
}

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

const MAX_PENDING_IMAGES = 5;

const STARTERS: Record<AssistantMode, { icon: ComponentType<IconProps>; label: string }[]> = {
  ask: [
    { icon: Wand2, label: "Summarize this page in 3 bullets" },
    { icon: MessageCircle, label: "What is this page missing?" },
    { icon: BookOpen, label: "Explain the structure of this page" },
  ],
  plan: [
    { icon: ListChecks, label: "Plan a rewrite of this page" },
    { icon: FilePlus2, label: "Outline a meeting notes page for tomorrow" },
    { icon: PenLine, label: "Propose a better structure for this page" },
  ],
  agent: [
    { icon: PenLine, label: "Continue writing this page" },
    { icon: Wand2, label: "Summarize this page in 3 bullets" },
    { icon: FilePlus2, label: "Create a meeting notes page for tomorrow" },
    { icon: ImageIcon, label: "Generate an image of a serene mountain at dawn" },
  ],
};

export function AIAssistant({ open, onClose, activeEntry, allEntries, onCreateEntry, onNavigate }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings draft state — committed to storage when user hits Save.
  const [provider, setProviderState] = useState(getActiveProvider());
  const [apiKey, setApiKeyState] = useState(getApiKeyFor(getActiveProvider()));
  const [model, setModelState] = useState(getModelFor(getActiveProvider()));
  const [showKey, setShowKey] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [mode, setModeState] = useState<AssistantMode>(getAssistantMode);

  const abortRef = useRef<AbortController | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;
  // What the model has already been told, so we don't pay for it twice.
  const sentContextRef = useRef<SentContext>(NO_CONTEXT_SENT);

  // Re-sync settings draft whenever the panel opens or provider changes.
  useEffect(() => {
    setProviderState(getActiveProvider());
    setApiKeyState(getApiKeyFor(getActiveProvider()));
    setModelState(getModelFor(getActiveProvider()));
    if (!getApiKeyFor(getActiveProvider())) setShowSettings(true);
  }, [open]);

  useEffect(() => {
    // When user picks a different provider in the dropdown, surface that
    // provider's key + model.
    setApiKeyState(getApiKeyFor(provider));
    setModelState(getModelFor(provider));
  }, [provider]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    return () => {
      for (const img of pendingImagesRef.current) URL.revokeObjectURL(img.previewUrl);
    };
  }, []);

  const activeModelSupportsVision = useCallback((): boolean => {
    const providerObj = getProvider(getActiveProvider());
    const modelId = getModelFor(getActiveProvider());
    return providerObj?.models.find((m) => m.id === modelId)?.vision === true;
  }, []);

  const addPendingImages = useCallback((files: FileList | File[]) => {
    if (!activeModelSupportsVision()) {
      toast.error("This model doesn't support images", {
        description: "Switch to a vision-capable model in AI settings.",
      });
      return;
    }
    const next: PendingImage[] = [];
    for (const file of files) {
      if (pendingImages.length + next.length >= MAX_PENDING_IMAGES) {
        toast.error(`At most ${MAX_PENDING_IMAGES} images per message`);
        break;
      }
      if (!isAllowedImageFile(file)) {
        toast.error("Unsupported image", { description: "Use PNG, JPEG, WebP, GIF, AVIF, or SVG under 10 MB." });
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
    }
    if (next.length) setPendingImages((prev) => [...prev, ...next]);
  }, [activeModelSupportsVision, pendingImages.length]);

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const applyTools = useCallback(async (tools: { kind: string; body: string }[]): Promise<{ label: string; onClick: () => void }[]> => {
    const actions: { label: string; onClick: () => void }[] = [];
    const editor = (window as any).__nw_editor;

    for (const t of tools) {
      if (t.kind === "write" && editor) {
        // Convert model markdown to HTML and sanitize before it enters the doc.
        const html = sanitizeHtml(markdownToHtml(t.body));
        editor.chain().focus("end").insertContent(html).run();
        actions.push({ label: "Wrote to page", onClick: () => {} });
      } else if (t.kind === "replace" && editor) {
        editor.commands.setContent(sanitizeHtml(markdownToHtml(t.body)));
        actions.push({ label: "Replaced page", onClick: () => {} });
      } else if (t.kind === "newpage" && user) {
        const lines = t.body.split("\n");
        let title = "";
        let bodyStart = 0;
        if (lines[0]?.toLowerCase().startsWith("title:")) {
          title = lines[0].slice(6).trim();
          bodyStart = 1;
          if (lines[1]?.trim() === "---") bodyStart = 2;
        }
        const body = lines.slice(bodyStart).join("\n").trim();
        const content = title ? `# ${title}\n\n${body}` : body;
        try {
          const parentId = activeEntry?.id;
          const ownerId = activeEntry && activeEntry.user_id !== user.id
            ? activeEntry.user_id
            : user.id;
          const entry = await createEntry(ownerId, content, parentId);
          onCreateEntry(entry);
          onNavigate(entry.id);
          actions.push({ label: `Opened "${title || "new page"}"`, onClick: () => onNavigate(entry.id) });
        } catch (e) {
          console.error("create page failed", e);
          toast.error("Couldn't create page", { description: (e as Error).message });
        }
      } else if (t.kind === "image" && editor && user) {
        try {
          const { base64, mimeType } = await generateImage(t.body);
          // Convert base64 -> File and upload to Supabase storage so the image
          // survives reloads and exports.
          const bin = atob(base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const file = new File([bytes], `ai-${Date.now()}.png`, { type: mimeType });
          const url = await uploadImage(file, user.id);
          if (url) {
            editor.chain().focus("end").setImage({ src: url }).run();
            actions.push({ label: "Inserted AI image", onClick: () => {} });
          }
        } catch (e: any) {
          console.error("image gen failed", e);
          actions.push({ label: `Image failed: ${e?.message || "unknown"}`, onClick: () => {} });
        }
      }
    }
    return actions;
  }, [activeEntry, user, onCreateEntry, onNavigate]);

  const activePageContext = useCallback((): ActivePage | null => {
    if (!activeEntry) return null;
    const liveContent = (window as any).__nw_getMarkdown?.() ?? activeEntry.content;
    return {
      id: activeEntry.id,
      title: getEntryTitle(activeEntry),
      content: liveContent,
      drawings: collectDrawingsFromContent(liveContent).map((d) => ({
        sceneId: d.sceneId,
        elementCount: d.elementCount,
        hasImage: Boolean(d.imageUrl),
      })),
      images: collectImagesFromContent(liveContent).map((img) => ({
        alt: img.alt,
        hasUrl: Boolean(img.url),
      })),
    };
  }, [activeEntry]);

  const setMode = useCallback((next: AssistantMode) => {
    setModeState(next);
    setAssistantMode(next);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || streaming) return;
    if (!getApiKeyFor(getActiveProvider())) { setShowSettings(true); return; }
    const promptedMode = mode;

    const page = activePageContext();
    const wantsVisual = mentionsVisual(text);
    const needsPageVision = wantsVisual && (page?.images.length ?? 0) > 0;
    if ((hasImages || needsPageVision) && !activeModelSupportsVision()) {
      toast.error("This model doesn't support images", {
        description: "Switch to a vision-capable model in AI settings.",
      });
      return;
    }

    const sentImages = [...pendingImages];
    for (const img of sentImages) URL.revokeObjectURL(img.previewUrl);
    setPendingImages([]);

    const userAttachments = await filesToImageAttachments(sentImages.map((img) => img.file));
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || "_(image attached)_",
      imagePreviews: userAttachments.map((a) => `data:${a.mimeType};base64,${a.base64}`),
    };
    const asstMsg: UIMessage = { id: crypto.randomUUID(), role: "model", content: "", pending: true };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const { context, sent } = buildPromptContext(
      allEntries.map((e) => ({ id: e.id, title: getEntryTitle(e) })),
      page,
      sentContextRef.current,
    );
    sentContextRef.current = sent;

    // Vision pixels are large — text context always lists drawings/images;
    // attach pixels only when the message is about them (or the user attached).
    let images: { base64: string; mimeType: string }[] | undefined;
    if (userAttachments.length) images = [...userAttachments];

    if (wantsVisual && activeModelSupportsVision()) {
      const room = () => MAX_PAGE_IMAGES - (images?.length ?? 0);

      if (page?.images.length && room() > 0) {
        const pageImgs = await imagesAsAttachments(collectImagesFromContent(page.content));
        if (pageImgs.length) {
          images = [...(images || []), ...pageImgs].slice(0, MAX_PAGE_IMAGES);
        }
      }
      if (page?.drawings.length && room() > 0) {
        const attachments = await snapshotsAsAttachments(
          collectDrawingsFromContent(page.content),
        );
        if (attachments.length) {
          images = [...(images || []), ...attachments].slice(0, MAX_PAGE_IMAGES);
        }
      }
    }

    const history: ChatMessage[] = [
      ...messages.map<ChatMessage>((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text || "_(image attached)_" },
    ];

    try {
      let acc = "";
      for await (const chunk of streamChat({
        messages: history,
        systemInstruction: `${systemPromptFor(promptedMode)}\n${context}`,
        signal: ctrl.signal,
        images,
      })) {
        acc += chunk;
        setMessages((prev) => prev.map((m) => (m.id === asstMsg.id ? { ...m, content: acc } : m)));
      }

      const { display, toolsToApply } = finalizeAssistantOutput(acc, promptedMode, modeRef.current);
      const actions = toolsToApply.length ? await applyTools(toolsToApply) : [];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstMsg.id
            ? { ...m, content: display, pending: false, actions }
            : m
        )
      );
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "_(stopped)_" : (e?.message || "Failed");
      setMessages((prev) => prev.map((m) => (m.id === asstMsg.id ? { ...m, content: msg, pending: false } : m)));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, allEntries, activePageContext, applyTools, pendingImages, activeModelSupportsVision, mode]);

  const stop = () => abortRef.current?.abort();

  const saveSettings = () => {
    setActiveProvider(provider);
    setApiKeyFor(provider, apiKey);
    setModelFor(provider, model);
    setShowSettings(false);
  };

  const { width, onMouseDown } = useResizable({
    storageKey: "nw:aiWidth", defaultWidth: 420, min: 320, max: 720, side: "right",
  });

  if (!open) return null;

  const providerObj = getProvider(provider);
  const activeProviderObj = getProvider(getActiveProvider());
  const activeModelId = getModelFor(getActiveProvider());

  return (
    <aside
      style={{ width }}
      className="fixed top-0 right-0 bottom-0 z-40 bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 max-w-full max-md:inset-0 max-md:!w-full max-md:z-50"
    >
      <div
        onMouseDown={onMouseDown}
        className="nw-resize-handle absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50 hidden md:block"
        title="Drag to resize"
      />

      <div className="h-12 flex items-center px-3 border-b border-border-subtle gap-2 shrink-0 bg-gradient-to-b from-card to-card/80">
        {streaming ? (
          <AIThinkingStatus size={20} label="Generating answer" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-foreground" />
        )}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[11px] font-semibold tracking-tight">AI Assistant</span>
          <span className="text-[9px] text-muted-foreground/70 font-mono truncate max-w-[200px]">
            {activeProviderObj?.label || "—"} · {activeModelId} · {mode}
          </span>
        </div>
        <span className="nw-ascii-bar ml-2 hidden sm:inline-block" aria-hidden />
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={() => setShowSettings((s) => !s)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="AI settings">
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Close (⌘J)">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="p-3 border-b border-border bg-secondary/30 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProviderState(e.target.value)}
              className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{providerObj?.label} API key</label>
            <div className="flex items-center gap-1 mt-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder={providerObj?.keyPlaceholder || "API key"}
                className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={() => setShowKey((s) => !s)} className="p-1.5 rounded text-muted-foreground hover:text-foreground" title={showKey ? "Hide" : "Show"}>
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Stored in your browser only. Get one at{" "}
              <a href={providerObj?.keyHelpUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                {(providerObj?.keyHelpUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>.
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Model</label>
            <AIModelSelect
              models={providerObj?.models || []}
              value={model}
              onChange={setModelState}
              triggerClassName="w-full mt-1 bg-background border-border"
            />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={saveSettings} className="flex-1 bg-primary text-primary-foreground text-xs font-medium rounded px-3 py-1.5 hover:opacity-90 transition-opacity">
              Save
            </button>
            {getApiKeyFor(provider) && (
              <button onClick={() => { clearApiKeyFor(provider); setApiKeyState(""); }} className="text-[10px] text-muted-foreground hover:text-destructive px-2">
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !showSettings && (
          <div className="text-center text-muted-foreground/80 py-6 space-y-4">
            <pre className="text-[10px] leading-tight font-mono select-none text-muted-foreground/40 mx-auto inline-block text-left">
{`  ╭─────────────╮
  │  ai · ${mode.padEnd(5)} │
  │  ─────────  │
  │  ⌘J  toggle │
  ╰─────────────╯`}
            </pre>
            <p className="text-[11px]">{emptyStateBlurb(mode)}</p>
            <div className="grid gap-1.5 max-w-[300px] mx-auto">
              {STARTERS[mode].map((s) => (
                <button key={s.label} onClick={() => setInput(s.label)} className="nw-ai-chip">
                  <s.icon className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
            <div className={`max-w-[88%] ai-msg-bubble ${m.role === "user" ? "user" : "assistant"}`}>
              {m.imagePreviews && m.imagePreviews.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {m.imagePreviews.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className="h-16 w-16 rounded object-cover border border-border/40"
                    />
                  ))}
                </div>
              )}
              {m.pending && !m.content ? (
                <AIThinkingStatus />
              ) : (
                <div
                  className="ai-msg-prose"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(marked.parse(m.content || "", { async: false }) as string) +
                      (m.pending ? '<span class="nw-caret"></span>' : ""),
                  }}
                />
              )}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.actions.map((a, i) => (
                    <button key={i} onClick={a.onClick} className="text-[10px] bg-background/40 hover:bg-background/80 rounded px-2 py-0.5 transition-colors border border-border/40">
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-2.5 border-t border-border shrink-0 bg-card/60">
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-0.5">
            {pendingImages.map((img) => (
              <div key={img.id} className="relative group">
                <img
                  src={img.previewUrl}
                  alt=""
                  className="h-14 w-14 rounded object-cover border border-border/60"
                />
                <button
                  type="button"
                  onClick={() => removePendingImage(img.id)}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addPendingImages(e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files: File[] = [];
              for (const item of e.clipboardData?.items ?? []) {
                if (item.type.startsWith("image/")) {
                  const file = item.getAsFile();
                  if (file) files.push(file);
                }
              }
              if (files.length) {
                e.preventDefault();
                addPendingImages(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={placeholderFor(mode)}
            rows={2}
            className="nw-ai-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming || pendingImages.length >= MAX_PENDING_IMAGES}
            className="absolute left-2 top-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            title="Attach image"
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </button>
          {streaming ? (
            <button onClick={stop} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-destructive hover:bg-accent transition-colors" title="Stop">
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim() && pendingImages.length === 0} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-foreground hover:bg-accent disabled:opacity-30 transition-colors" title="Send (Enter)">
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5">
          <AIModeSelect value={mode} onChange={setMode} />
          <span className="text-[9px] text-muted-foreground/50 font-mono truncate">
            {mode === "agent" ? "can edit pages" : "never edits"} · ⏎ send
          </span>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground/50 font-mono shrink-0">
            <span className={`h-1.5 w-1.5 rounded-full ${getApiKeyFor(getActiveProvider()) ? "bg-foreground/60" : "bg-destructive/70"}`} />
            {getApiKeyFor(getActiveProvider()) ? "key linked" : "no key"}
          </span>
        </div>
      </div>
    </aside>
  );
}
