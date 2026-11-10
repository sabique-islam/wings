import { test, expect, type Page } from "@playwright/test";

async function openChat(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("wings_ai_provider", "google");
    localStorage.setItem("wings_ai_key_google", "test-key");
    localStorage.setItem("wings_ai_mode", "ask");
    localStorage.setItem("wings:cookie-consent:v1", JSON.stringify({ decidedAt: Date.now(), essential: true, analytics: false, marketing: false }));
  });
  await page.goto("/__ai-e2e");
  const banner = page.getByRole("button", { name: /reject|necessary only/i });
  if (await banner.isVisible()) await banner.click();
}

async function respond(page: Page, reply: string) {
  const requests: unknown[] = [];
  await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] })}\n\n` });
  });
  return requests;
}

// A real one-page PDF with selectable text; offsets are computed, not hand-waved.
function pdfFixture() {
  const text = "BT /F1 12 Tf 20 100 Td (Chat PDF attachment works) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = out.length;
  out += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(out);
}

test("chat renders real Mermaid, math, highlighted code and a table", async ({ page }) => {
  await openChat(page);
  await respond(page, "```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n```\n\nInline $x^2$.\n\n```ts\nconst answer = 42;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
  await page.getByRole("textbox", { name: "Message AI" }).fill("Show me a diagram");
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  const assistant = page.locator(".ai-msg-bubble.assistant");
  await expect(assistant.locator(".code-mermaid-svg svg")).toBeVisible({ timeout: 20_000 });
  await expect(assistant.locator(".code-mermaid-svg svg")).toContainText("Start");
  await expect(assistant.locator(".code-mermaid-svg svg")).toContainText("Finish");
  await expect(assistant.locator(".katex")).toHaveCount(1);
  await expect(assistant.locator(".hljs-keyword")).toHaveText("const");
  await expect(assistant.locator("table")).toBeVisible();
  await assistant.getByRole("button", { name: "Source", exact: true }).click();
  await expect(assistant.locator("code.language-mermaid")).toContainText("A[Start]");
  await assistant.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(assistant.locator(".code-mermaid-svg svg")).toBeVisible();
  await page.getByRole("complementary", { name: "AI Assistant" }).screenshot({ path: test.info().outputPath("rich-chat.png") });
  await assistant.getByRole("button", { name: "Expand" }).click();
  await expect(page.getByRole("dialog").locator("svg").first()).toBeVisible();
});

test("invalid Mermaid shows a recoverable error and keeps its source", async ({ page }) => {
  await openChat(page);
  await respond(page, "```mermaid\nthis is not a valid diagram\n```");
  await page.getByRole("textbox", { name: "Message AI" }).fill("broken diagram");
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  await expect(page.getByTestId("code-mermaid-error")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator("code.language-mermaid")).toHaveText("this is not a valid diagram");
  await expect(page.locator('body > div[id^="dnwmermaid"]')).toHaveCount(0);
});

test("attachments preview locally, send document text and retain it on follow-ups", async ({ page }) => {
  await openChat(page);
  const requests = await respond(page, "I read the attached text.");
  await page.getByLabel("Attach files", { exact: true }).setInputFiles([
    { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("Attachment secret: orchid") },
    { name: "recording.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("fake-audio") },
    { name: "archive.zip", mimeType: "application/zip", buffer: Buffer.from("fake-zip") },
  ]);
  await expect(page.getByTestId("chat-attachment")).toHaveCount(3);
  await expect(page.locator("audio[controls]")).toHaveCount(1);
  await page.getByRole("button", { name: "Preview notes.md", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Attachment secret: orchid");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Remove archive.zip" }).click();
  await expect(page.getByTestId("chat-attachment")).toHaveCount(2);
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  await expect(page.locator(".ai-msg-bubble.assistant")).toContainText("I read the attached text.");
  expect(JSON.stringify(requests[0])).toContain("Attachment secret: orchid");
  expect(JSON.stringify(requests[0])).toContain("not transcribed");
  expect(JSON.stringify(requests[0])).not.toContain("fake-audio");
  await page.getByRole("textbox", { name: "Message AI" }).fill("What was the secret?");
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  await expect(page.locator(".ai-msg-bubble.assistant")).toHaveCount(2);
  await expect.poll(() => requests.length).toBe(2);
  expect(JSON.stringify(requests[1])).toContain("Attachment secret: orchid");
});

test("PDF previews and text extraction use the bundled worker", async ({ page }) => {
  await openChat(page);
  const requests = await respond(page, "PDF received.");
  await page.getByLabel("Attach files", { exact: true }).setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: pdfFixture() });
  await page.getByRole("button", { name: "Preview report.pdf" }).click();
  await expect(page.getByRole("dialog")).toContainText("Page 1 of 1", { timeout: 20_000 });
  await expect(page.getByRole("dialog").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  await expect(page.locator(".ai-msg-bubble.assistant")).toContainText("PDF received.", { timeout: 20_000 });
  expect(JSON.stringify(requests[0])).toContain("Chat PDF attachment works");
  await expect(page.getByTestId("chat-attachment")).toContainText("Text sent to AI");
});

test("file drop, paste, limits and image follow-up context", async ({ page }) => {
  await openChat(page);
  const requests = await respond(page, "Image received.");
  const composer = page.getByRole("textbox", { name: "Message AI" });
  await composer.evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["drop contents"], "dropped.txt", { type: "text/plain" }));
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  await expect(page.getByTestId("chat-attachment")).toContainText("dropped.txt");
  await page.getByRole("button", { name: "Remove dropped.txt" }).click();
  await composer.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(page.getByRole("img", { name: "pasted.png" })).toBeVisible();
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  await expect(page.locator(".ai-msg-bubble.assistant")).toContainText("Image received.");
  expect(JSON.stringify(requests[0])).toContain("inline_data");
  await composer.fill("What is in the image?");
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(JSON.stringify(requests[1])).toContain("inline_data");
  // The sent preview remains valid after its pending attachment has been cleared.
  expect(await page.getByRole("img", { name: "pasted.png" }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(8);
  await page.getByLabel("Attach files", { exact: true }).setInputFiles(Array.from({ length: 6 }, (_, index) => ({ name: `file-${index}.txt`, mimeType: "text/plain", buffer: Buffer.from("text") })));
  await expect(page.getByLabel("Pending attachments").getByTestId("chat-attachment")).toHaveCount(5);
});

test("different Mermaid diagram families render through the shared renderer", async ({ page }) => {
  await openChat(page);
  const diagrams = [
    "sequenceDiagram\n Alice->>Bob: Hello",
    "classDiagram\n Animal <|-- Duck",
    "stateDiagram-v2\n [*] --> Ready\n Ready --> [*]",
    "erDiagram\n CUSTOMER ||--o{ ORDER : places",
    "gantt\n title Schedule\n dateFormat YYYY-MM-DD\n section Work\n Build :2026-11-10, 2d",
    "pie title Share\n \"A\" : 40\n \"B\" : 60",
    "mindmap\n root((Idea))\n  One\n  Two",
    "timeline\n title History\n 2025 : Start\n 2026 : Grow",
  ];
  await respond(page, diagrams.map((source) => `\`\`\`mermaid\n${source}\n\`\`\``).join("\n\n"));
  await page.getByRole("textbox", { name: "Message AI" }).fill("Show different diagrams");
  await page.getByRole("button", { name: "Send (Enter)" }).click();
  await expect(page.locator(".code-mermaid-svg svg")).toHaveCount(diagrams.length, { timeout: 20_000 });
  await expect(page.getByTestId("code-mermaid-error")).toHaveCount(0);
});
