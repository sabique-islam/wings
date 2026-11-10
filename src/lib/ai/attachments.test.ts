import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { attachmentKind, extractOfficeText, MAX_ATTACHMENT_TEXT, normalizeChatFile, prepareChatAttachments, type ChatAttachment } from "./attachments";

function attachment(file: File): ChatAttachment {
  return { id: "file", file, url: "blob:preview", kind: attachmentKind(file) };
}

describe("chat attachments", () => {
  it("recognizes files even when the picker supplies no MIME type", () => {
    for (const [name, kind] of [["diagram.svg", "image"], ["plan.mmd", "text"], ["sheet.csv", "text"], ["notes.docx", "document"], ["report.pdf", "pdf"], ["recording.mp3", "audio"], ["demo.webm", "video"], ["backup.zip", "file"]]) {
      expect(attachmentKind(normalizeChatFile(new File(["x"], name)))).toBe(kind);
    }
    expect(attachmentKind(new File(["bytes"], "photo.heic", { type: "image/heic" }))).toBe("file");
  });

  it("retains extracted document text and reports truncation", async () => {
    const result = await prepareChatAttachments([attachment(new File(["a".repeat(MAX_ATTACHMENT_TEXT + 1)], "notes.txt", { type: "text/plain" }))], new AbortController().signal);
    const records = JSON.parse(result.context.slice(result.context.indexOf("[{")));
    expect(records[0].text).toHaveLength(MAX_ATTACHMENT_TEXT);
    expect(records[0].status).toMatch(/truncated/);
  });

  it("keeps unknown binaries and media preview-only and rejects binary text", async () => {
    for (const [name, type, contents] of [["archive.zip", "application/zip", "bytes"], ["audio.mp3", "audio/mpeg", "audio"], ["bad.txt", "text/plain", "binary\0bytes"]]) {
      const result = await prepareChatAttachments([attachment(new File([contents], name, { type }))], new AbortController().signal);
      expect(result.statuses.file).toMatch(/Preview only/);
      expect(result.images).toHaveLength(0);
      const records = JSON.parse(result.context.slice(result.context.indexOf("[{")));
      expect(records[0].text).toBeUndefined();
    }
  });

  it("extracts DOCX, slides, spreadsheets and OpenDocument without executing content", () => {
    const docx = zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="urn:w"><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t> world</w:t></w:r></w:p></w:document>') });
    expect(extractOfficeText(docx, "docx")).toContain("Hello world");
    const pptx = zipSync({ "ppt/slides/slide10.xml": strToU8('<p xmlns:a="urn:a"><a:p><a:r><a:t>Last slide</a:t></a:r></a:p></p>'), "ppt/slides/slide2.xml": strToU8('<p xmlns:a="urn:a"><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p>') });
    expect(extractOfficeText(pptx, "pptx")).toMatch(/First slide[\s\S]*Last slide/);
    const xlsx = zipSync({ "xl/sharedStrings.xml": strToU8('<sst><si><t>Revenue</t></si></sst>'), "xl/worksheets/sheet1.xml": strToU8('<worksheet><row><c r="A1" t="s"><v>0</v></c><c r="C1"><v>123</v></c><c r="D1" t="inlineStr"><is><t>inline</t></is></c></row></worksheet>') });
    expect(extractOfficeText(xlsx, "xlsx")).toContain("A1: Revenue\tC1: 123\tD1: inline");
    const odt = zipSync({ "content.xml": strToU8('<doc xmlns:text="urn:text"><text:p>Open document</text:p></doc>') });
    expect(extractOfficeText(odt, "odt")).toContain("Open document");
  });

  it("bounds decompression and honors cancellation before reading", async () => {
    const large = zipSync({ "word/document.xml": new Uint8Array(10 * 1024 * 1024 + 1) });
    expect(() => extractOfficeText(large, "docx")).toThrow(/too large/);
    const controller = new AbortController();
    controller.abort();
    await expect(prepareChatAttachments([attachment(new File(["hello"], "notes.txt"))], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
