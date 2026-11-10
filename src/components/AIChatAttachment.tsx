import { lazy, Suspense, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { attachmentSize, type ChatAttachment, readFile } from "@/lib/ai/attachments";

const PdfPreview = lazy(() => import("./AIChatPdfPreview"));

export function AIChatAttachment({ attachment, onRemove }: { attachment: ChatAttachment; onRemove?: () => void }) {
  const { file, url, kind, status } = attachment;
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const preview = kind === "image" ? <img src={url} alt={file.name} /> : kind === "audio" ? <audio src={url} controls preload="none" /> : kind === "video" ? <video src={url} controls preload="metadata" /> : null;
  const openPreview = () => {
    setExpanded(true);
    if (kind === "text") void readFile(file.slice(0, 40_000), "text").then(setText, () => setText("Could not read file"));
  };
  return (
    <div className="ai-attachment" data-testid="chat-attachment">
      {preview && <div className="ai-attachment-preview">{kind === "image" ? <button type="button" onClick={openPreview} aria-label={`Preview ${file.name}`}>{preview}</button> : preview}</div>}
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="block truncate font-medium" title={file.name}>{file.name}</span>
          <span className="text-muted-foreground">{attachmentSize(file.size)} · {kind}</span>
        </div>
        {(kind === "pdf" || kind === "text") && <button type="button" onClick={openPreview} aria-label={`Preview ${file.name}`}>Preview</button>}
        <a href={url} download={file.name} aria-label={`Download ${file.name}`}>Save</a>
        {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>×</button>}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground" role="status">{status || (kind === "image" ? "Image will be sent to AI" : ["text", "document", "pdf"].includes(kind) ? "Readable text will be sent to AI" : "Preview only · contents not sent to AI")}</p>
      {expanded && <Dialog open onOpenChange={setExpanded}><DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto"><DialogTitle className="break-all pr-6">{file.name}</DialogTitle>{kind === "pdf" ? <Suspense fallback={<p>Loading PDF…</p>}><PdfPreview file={file} /></Suspense> : kind === "text" ? <pre className="whitespace-pre-wrap break-words text-xs max-h-[70vh] overflow-auto">{text ?? "Reading file…"}</pre> : <img src={url} alt={file.name} className="max-h-[75vh] mx-auto object-contain" />}</DialogContent></Dialog>}
    </div>
  );
}
