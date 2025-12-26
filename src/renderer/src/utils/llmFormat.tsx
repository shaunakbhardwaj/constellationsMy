import React from 'react'

type InlineNode = string | React.JSX.Element

function nextTokenIndex(text: string, start: number): { pos: number; type: 'code' | 'bold' | 'italic' } | null {
  const codePos = text.indexOf('`', start)
  const boldPos = text.indexOf('**', start)
  let italicPos = text.indexOf('*', start)
  if (italicPos !== -1 && italicPos === boldPos) {
    italicPos = text.indexOf('*', italicPos + 2)
  }

  const candidates = [
    { pos: codePos, type: 'code' as const },
    { pos: boldPos, type: 'bold' as const },
    { pos: italicPos, type: 'italic' as const }
  ].filter((item) => item.pos !== -1)

  if (candidates.length === 0) return null

  candidates.sort((a, b) => a.pos - b.pos)
  return candidates[0]
}

function renderInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let cursor = 0
  let key = 0

  while (cursor < text.length) {
    const token = nextTokenIndex(text, cursor)
    if (!token) {
      nodes.push(text.slice(cursor))
      break
    }

    if (token.pos > cursor) {
      nodes.push(text.slice(cursor, token.pos))
    }

    if (token.type === 'code') {
      const end = text.indexOf('`', token.pos + 1)
      if (end === -1) {
        nodes.push(text.slice(token.pos))
        break
      }
      const content = text.slice(token.pos + 1, end)
      nodes.push(
        <code key={`code-${key++}`}>{content}</code>
      )
      cursor = end + 1
      continue
    }

    if (token.type === 'bold') {
      const end = text.indexOf('**', token.pos + 2)
      if (end === -1) {
        nodes.push(text.slice(token.pos))
        break
      }
      const content = text.slice(token.pos + 2, end)
      nodes.push(
        <strong key={`bold-${key++}`}>{content}</strong>
      )
      cursor = end + 2
      continue
    }

    if (token.type === 'italic') {
      const end = text.indexOf('*', token.pos + 1)
      if (end === -1) {
        nodes.push(text.slice(token.pos))
        break
      }
      const content = text.slice(token.pos + 1, end)
      nodes.push(
        <em key={`italic-${key++}`}>{content}</em>
      )
      cursor = end + 1
      continue
    }

    nodes.push(text.slice(token.pos))
    break
  }

  return nodes
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(line)
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function isHeading(line: string): { level: number; text: string } | null {
  const match = /^(#{1,4})\s+(.*)$/.exec(line.trim())
  if (!match) return null
  return { level: match[1].length, text: match[2] }
}

function isListItem(line: string): { ordered: boolean; text: string } | null {
  const ordered = /^\s*\d+[\.\)]\s+/.exec(line)
  if (ordered) {
    return { ordered: true, text: line.replace(/^\s*\d+[\.\)]\s+/, '') }
  }
  const unordered = /^\s*[-*•]\s+/.exec(line)
  if (unordered) {
    return { ordered: false, text: line.replace(/^\s*[-*•]\s+/, '') }
  }
  return null
}

function isHorizontalRule(line: string): boolean {
  return /^\s*[-*_]{3,}\s*$/.test(line)
}

function isBlockStart(line: string, nextLine?: string): boolean {
  return Boolean(
    line.trim().startsWith('```') ||
      isHeading(line) ||
      isHorizontalRule(line) ||
      isListItem(line) ||
      (nextLine && line.includes('|') && isTableSeparator(nextLine))
  )
}

export function formatLLMResponse(text: string): React.JSX.Element {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.JSX.Element[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    if (line.trim().startsWith('```')) {
      const fence = line.trim()
      const lang = fence.slice(3).trim()
      i += 1
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push(
        <pre key={`code-block-${key++}`} className={lang ? `lang-${lang}` : undefined}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    if (i + 1 < lines.length && line.includes('|') && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line)
      i += 2
      const body: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().length > 0) {
        body.push(splitTableRow(lines[i]))
        i += 1
      }
      blocks.push(
        <table key={`table-${key++}`}>
          <thead>
            <tr>
              {header.map((cell, idx) => (
                <th key={`th-${key++}-${idx}`}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={`tr-${key++}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`td-${key++}-${rowIndex}-${cellIndex}`}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }

    const heading = isHeading(line)
    if (heading) {
      const HeadingTag = heading.level <= 2 ? 'h4' : 'h5'
      blocks.push(
        <HeadingTag key={`heading-${key++}`}>{renderInline(heading.text)}</HeadingTag>
      )
      i += 1
      continue
    }

    if (isHorizontalRule(line)) {
      blocks.push(<hr key={`hr-${key++}`} />)
      i += 1
      continue
    }

    const listItem = isListItem(line)
    if (listItem) {
      const ordered = listItem.ordered
      const items: string[] = [listItem.text]
      i += 1
      while (i < lines.length) {
        const nextItem = isListItem(lines[i])
        if (!nextItem || nextItem.ordered !== ordered) break
        items.push(nextItem.text)
        i += 1
      }
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag key={`list-${key++}`}>
          {items.map((item, itemIndex) => (
            <li key={`li-${key++}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ListTag>
      )
      continue
    }

    const paragraphLines: string[] = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) {
      paragraphLines.push(lines[i])
      i += 1
    }
    const paragraphText = paragraphLines.join(' ').replace(/\s+/g, ' ').trim()
    blocks.push(
      <p key={`p-${key++}`}>{renderInline(paragraphText)}</p>
    )
  }

  return <>{blocks}</>
}
