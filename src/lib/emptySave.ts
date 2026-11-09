/** Block autosave that would replace substantial content with an empty doc. */
export function shouldBlockEmptySave(existingContent: string, nextMarkdown: string): boolean {
  const had = existingContent.trim().length;
  const next = nextMarkdown.trim().length;
  return had >= 20 && next === 0;
}

