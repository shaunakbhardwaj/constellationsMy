/**
 * Subdivide text that exceeds maxSize into smaller pieces.
 * Attempts to break at sentence boundaries ('. ') first, then spaces.
 */
function subdivideText(text: string, maxSize: number): string[] {
  const result: string[] = []
  let remaining = text

  while (remaining.length > maxSize) {
    // Try to break at a sentence boundary first
    let breakPoint = remaining.lastIndexOf('. ', maxSize)

    // If no good sentence break, try a space
    if (breakPoint === -1 || breakPoint < maxSize * 0.5) {
      breakPoint = remaining.lastIndexOf(' ', maxSize)
    }

    // If still no break point, force cut at maxSize
    if (breakPoint === -1) {
      breakPoint = maxSize
    }

    result.push(remaining.slice(0, breakPoint + 1).trim())
    remaining = remaining.slice(breakPoint + 1).trim()
  }

  if (remaining) result.push(remaining)
  return result
}

export function splitTextIntoChunks(text: string, maxChunkSize = 1000): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\s*\n/)

  let currentChunk = ''

  for (const para of paragraphs) {
    // If the paragraph itself is too large, subdivide it
    if (para.length > maxChunkSize) {
      // First, push any accumulated chunk
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }
      // Subdivide the large paragraph
      const subChunks = subdivideText(para, maxChunkSize)
      chunks.push(...subChunks)
      continue
    }

    if ((currentChunk + para).length > maxChunkSize) {
      if (currentChunk) chunks.push(currentChunk.trim())
      currentChunk = para
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim())

  return chunks.filter((c) => c.length > 0)
}
