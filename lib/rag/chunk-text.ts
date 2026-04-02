/**
 * Local recursive-style chunking (paragraph → line → word → hard cut) with overlap.
 * Avoids @langchain/textsplitters so the RAG bundle does not depend on that package.
 */

export function splitTextIntoChunks(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized) return [];

  const safeOverlap = Math.min(Math.max(0, chunkOverlap), Math.max(0, chunkSize - 1));
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      const searchFrom = Math.max(start + Math.floor(chunkSize * 0.55), start);
      let breakAt = end;

      const para = normalized.lastIndexOf('\n\n', end - 1);
      if (para >= searchFrom) breakAt = para + 2;
      else {
        const line = normalized.lastIndexOf('\n', end - 1);
        if (line >= searchFrom) breakAt = line + 1;
        else {
          const space = normalized.lastIndexOf(' ', end - 1);
          if (space >= searchFrom) breakAt = space + 1;
        }
      }

      end = breakAt;
    }

    const slice = normalized.slice(start, end).trim();
    if (slice.length > 0) chunks.push(slice);

    if (end >= normalized.length) break;
    start = Math.max(end - safeOverlap, start + 1);
  }

  return chunks;
}
