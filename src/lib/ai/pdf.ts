/** Bundled worker keeps local PDFs on-device; no CDN or document upload. */
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  return pdfjs;
}
