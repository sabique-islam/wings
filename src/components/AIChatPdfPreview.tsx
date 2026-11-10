import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { loadPdfJs } from "@/lib/ai/pdf";
import { readFile } from "@/lib/ai/attachments";

export default function AIChatPdfPreview({ file }: { file: File }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<typeof loadPdfJs>>["getDocument"]> | undefined;
    void (async () => {
      try {
        const api = await loadPdfJs();
        const data = new Uint8Array(await readFile(file, "bytes"));
        if (cancelled) return;
        task = api.getDocument({ data, useSystemFonts: true });
        task.onPassword = () => { setError("This PDF is password protected. Download it to open it."); void task?.destroy(); };
        const document = await task.promise;
        if (!cancelled) setPdf(document);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open PDF");
      }
    })();
    return () => { cancelled = true; void task?.destroy(); };
  }, [file]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    setRendering(true);
    void (async () => {
      try {
        const documentPage = await pdf.getPage(page);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const viewport = documentPage.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        task = documentPage.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not display PDF page");
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, page]);
  return <div className="space-y-2">
    {error ? <p role="alert">{error}</p> : <>
      {pdf && <div className="flex justify-center items-center gap-4 text-xs"><button type="button" disabled={page <= 1 || rendering} onClick={() => setPage(page - 1)}>Previous page</button><span>Page {page} of {pdf.numPages}</span><button type="button" disabled={page >= pdf.numPages || rendering} onClick={() => setPage(page + 1)}>Next page</button></div>}
      {rendering && <p role="status">Loading PDF…</p>}
      <canvas ref={canvasRef} className="max-w-full mx-auto" aria-label={`PDF page ${page}`} />
    </>}
  </div>;
}
